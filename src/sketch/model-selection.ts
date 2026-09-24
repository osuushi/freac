import * as THREE from "three";
import { pickFace } from "../model/body-view.js";
import { pickBodyEdge } from "../model/edge-selection.js";
import {
  type Operation,
  type OperationInputs,
  type Resolution,
  resolveOperation,
} from "../model/operation-selection.js";
import { expandedSelection, selectionContext } from "../model/selection-context.js";
import { defaultModelingTool, type ModelingTool } from "../model/tool-policy.js";
import { curveDistance } from "./curve-geometry.js";
import type { Sketch, SketchDocument } from "./document.js";
import type { SketchEditor } from "./editor.js";
import { type Point, type Vector, worldPoint } from "./planes.js";
import { type Profile, profileAt } from "./profiles.js";

export type { ModelingTool } from "../model/tool-policy.js";
export type ModelingTarget =
  | { kind: "body"; body: string; sketch?: never }
  | { kind: "edge"; body: string; edge: string; point?: Vector; sketch?: never }
  | { kind: "face"; body: string; face: string; sketch?: never }
  | { kind: "sketch"; sketch: string }
  | { kind: "profile"; sketch: string; profile: Profile };
export const modelingKey = (target: ModelingTarget): string =>
  target.kind === "body"
    ? target.body
    : target.kind === "edge"
      ? target.edge
      : target.kind === "face"
        ? target.face
        : target.kind === "sketch"
          ? target.sketch
          : target.profile.key;
export class ModelSelection {
  private selected: ModelingTarget[] = [];
  get targets(): ModelingTarget[] {
    return this.selected;
  }
  set targets(targets: ModelingTarget[]) {
    const previous = this.key;
    this.selected = targets;
    if (this.key !== previous) this.chosenTool = null;
  }
  private chosenTool: { key: string; tool: ModelingTool } | null = null;
  private get key(): string {
    return this.targets.map((target) => `${target.kind}:${modelingKey(target)}`).join("|");
  }
  get tool(): ModelingTool | null {
    if (this.chosenTool?.key === this.key) return this.chosenTool.tool;
    return this.document ? defaultModelingTool(this.targets, this.document) : null;
  }
  resolve<K extends Operation>(operation: K): Resolution<OperationInputs[K]> {
    return resolveOperation(
      operation,
      this.targets,
      this.document ?? { units: "mm", sketches: [] },
    );
  }

  setTool(tool: ModelingTool): void {
    this.chosenTool = { key: this.key, tool };
  }
  lastEdgeClick: { body: string; edge: string; point: Vector } | null = null;
  alternatives: ModelingTarget[] = [];
  hover: ModelingTarget | null = null;
  private document: SketchDocument | null = null;
  sync(document: SketchDocument): void {
    if (this.document === document) return;
    const previous = this.document;
    const sameBodies =
      (document.bodies ?? []).length === (previous?.bodies ?? []).length &&
      (document.bodies ?? []).every((body, index) => {
        const before = previous?.bodies?.[index];
        return body.id === before?.id && body.brep === before.brep;
      });
    if (!sameBodies) this.lastEdgeClick = null;
    this.document = document;
    this.targets = this.targets.filter(
      (t) =>
        (t.kind === "sketch" && document.sketches.some((s) => s.id === t.sketch)) ||
        (t.kind === "profile" &&
          sameBodies &&
          document.sketches.some(
            (sketch) =>
              sketch.id === t.sketch &&
              JSON.stringify(sketch) ===
                JSON.stringify(previous?.sketches.find((s) => s.id === t.sketch)),
          )) ||
        ((t.kind === "body" || t.kind === "edge" || t.kind === "face") &&
          !!document.bodies?.some(
            (b) =>
              b.id === t.body &&
              (t.kind === "body" ||
                (t.kind === "edge"
                  ? b.edges.some((e) => e.id === t.edge)
                  : b.faces.some((f) => f.id === t.face))),
          )),
    );
    this.hover = null;
    this.alternatives = [];
  }
  choose(target: ModelingTarget | null, add: boolean, toggle: boolean): void {
    this.chosenTool = null;
    if (!target) {
      if (!add && !toggle) this.targets = [];
      return;
    }
    if (target.kind === "edge" && target.point)
      this.lastEdgeClick = { body: target.body, edge: target.edge, point: target.point };
    if (
      toggle &&
      target.kind === "face" &&
      this.document &&
      this.targets.some((t) => t.kind === "body" && t.body === target.body)
    ) {
      this.targets = expandedSelection(selectionContext(this.targets, this.document));
    }
    const exists = this.targets.some((t) => modelingKey(t) === modelingKey(target));
    this.targets =
      toggle && exists
        ? this.targets.filter((t) => modelingKey(t) !== modelingKey(target))
        : add || toggle
          ? exists
            ? this.targets
            : [...this.targets, target]
          : [target];
  }
}
export function pickModels(
  editor: SketchEditor,
  screen: Point,
  maxDepth = Infinity,
): ModelingTarget[] {
  const hits: { target: ModelingTarget; depth: number; edge: boolean }[] = [];
  for (const sketch of editor.display.sketches) {
    if (!editor.visibility.visible(sketch.id)) continue;
    const point = editor.world.pointAt(sketch.plane, screen.x, screen.y);
    if (!point) continue;
    const tolerance = (editor.world.height / editor.world.canvas.clientHeight) * 6;
    const edge = sketch.curves.some((c) => curveDistance(c, point) < tolerance);
    const profile = profileAt(sketch, point);
    if (!edge && !profile) continue;
    const p = worldPoint(sketch.plane, point),
      camera = editor.world.camera.position;
    if (!editor.world.visiblePoint(new THREE.Vector3(...p))) continue;
    hits.push({
      target:
        edge || !profile
          ? { kind: "sketch", sketch: sketch.id }
          : { kind: "profile", sketch: sketch.id, profile },
      edge,
      depth: Math.hypot(p[0] - camera.x, p[1] - camera.y, p[2] - camera.z),
    });
  }
  const face = pickFace(editor, screen);
  if (face)
    hits.push({
      target: { kind: "face", body: face.body, face: face.face },
      depth: face.depth + 1e-5,
      edge: false,
    });
  hits.sort((a, b) => a.depth - b.depth || Number(b.edge) - Number(a.edge));
  const edge = pickBodyEdge(editor, screen);
  // Keep coincident geometry ahead of translucent planes despite the face sort bias.
  const targets = hits.filter((hit) => hit.depth <= maxDepth + 1e-4).map((hit) => hit.target);
  if (edge && edge.depth <= maxDepth + 1e-4)
    targets.unshift({ kind: "edge", body: edge.body, edge: edge.edge, point: edge.point });
  const selectedSketches = new Set(
    editor.modeling.targets.filter((target) => target.kind === "sketch").map((t) => t.sketch),
  );
  const priority = (target: ModelingTarget) =>
    !editor.world.active && target.sketch !== undefined && selectedSketches.has(target.sketch);
  return targets.sort((a, b) => Number(priority(b)) - Number(priority(a)));
}
export function pickModel(editor: SketchEditor, screen: Point): ModelingTarget | null {
  return pickModels(editor, screen)[0] ?? null;
}

/**
 * Returns fully contained visible topology. Faces win when a box contains both
 * faces and their boundary edges, so a face-editing gesture stays directly usable.
 */
export function selectModelsInFrustum(editor: SketchEditor, a: Point, b: Point): ModelingTarget[] {
  if (!editor.bodiesVisible) return [];
  const left = Math.min(a.x, b.x),
    right = Math.max(a.x, b.x),
    top = Math.min(a.y, b.y),
    bottom = Math.max(a.y, b.y);
  const contains = (point: Point) =>
    point.x >= left && point.x <= right && point.y >= top && point.y <= bottom;
  const contained = (points: readonly number[]) => {
    for (let i = 0; i < points.length; i += 3)
      if (!contains(editor.world.project([points[i], points[i + 1], points[i + 2]]))) return false;
    return points.length > 0;
  };
  const faces: ModelingTarget[] = [],
    edges: ModelingTarget[] = [];
  for (const body of editor.display.bodies ?? []) {
    if (!editor.visibility.visible(body.id)) continue;
    for (const face of body.faces)
      if (contained(face.vertices)) faces.push({ kind: "face", body: body.id, face: face.id });
    for (const edge of body.edges)
      if (contained(edge.points)) edges.push({ kind: "edge", body: body.id, edge: edge.id });
  }
  return faces.length ? faces : edges;
}
export function modelingSketch(editor: SketchEditor): Sketch | undefined {
  const ids = new Set(editor.modeling.targets.map((t) => t.sketch));
  return ids.size === 1 ? editor.display.sketches.find((s) => ids.has(s.id)) : undefined;
}
