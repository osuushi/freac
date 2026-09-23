import * as THREE from "three";
import type { SketchEditor } from "../sketch/editor.js";
import type { ModelingTarget } from "../sketch/model-selection.js";
import { type PlaneFrame, type PlaneId, type Point, planes } from "../sketch/planes.js";
import { edgeRayHits, faceRayHits, screenRay } from "./body-ray-hits.js";

export type OverlapTarget =
  | Extract<ModelingTarget, { kind: "body" | "face" | "edge" }>
  | { kind: "plane"; frame: PlaneFrame; world?: PlaneId; saved?: string };
export interface OverlapCandidate {
  target: OverlapTarget;
  depth: number;
  key: string;
  label: string;
}
export function overlapCandidates(editor: SketchEditor, screen: Point): OverlapCandidate[] {
  const ray = screenRay(editor, screen),
    camera = editor.world.camera.position;
  const bodies = editor.bodiesVisible
    ? (editor.display.bodies ?? []).filter((b) => editor.visibility.visible(b.id))
    : [];
  const result: OverlapCandidate[] = [];
  for (const hit of faceRayHits(bodies, ray, camera))
    result.push({
      target: { kind: "face", body: hit.body, face: hit.face },
      depth: hit.depth,
      key: hit.face,
      label: "Face",
    });
  for (const hit of edgeRayHits(editor, screen, bodies))
    result.push({
      target: { kind: "edge", body: hit.body, edge: hit.edge, point: hit.point },
      depth: hit.depth,
      key: hit.edge,
      label: "Edge",
    });
  for (const body of bodies) {
    const hits = result.filter((c) => c.target.kind !== "plane" && c.target.body === body.id);
    if (hits.length)
      result.push({
        target: { kind: "body", body: body.id },
        depth: Math.min(...hits.map((h) => h.depth)),
        key: body.id,
        label: "Body",
      });
  }
  const refs: Extract<OverlapTarget, { kind: "plane" }>[] = [
    ...Object.entries(planes).map(([id, frame]) => ({
      kind: "plane" as const,
      frame,
      world: id as PlaneId,
    })),
    ...(editor.display.constructionPlanes ?? [])
      .filter((p) => editor.visibility.visible(p.id))
      .map((p) => ({ kind: "plane" as const, frame: p.frame, saved: p.id })),
  ];
  for (const target of refs) {
    const { frame } = target,
      u = new THREE.Vector3(...frame.u),
      v = new THREE.Vector3(...frame.v),
      origin = new THREE.Vector3(...frame.origin);
    const support = new THREE.Plane().setFromNormalAndCoplanarPoint(u.clone().cross(v), origin);
    const hit = ray.intersectPlane(support, new THREE.Vector3());
    if (!hit) continue;
    const local = hit.clone().sub(origin),
      bounds = editor.world.planeBounds(frame),
      x = local.dot(u),
      y = local.dot(v);
    if (x < bounds.minX || x > bounds.maxX || y < bounds.minY || y > bounds.maxY) continue;
    result.push({
      target,
      depth: hit.distanceTo(camera),
      key: target.world ?? target.saved ?? "plane",
      label: target.world ? `Plane · ${target.world}` : "Plane",
    });
  }
  const rank = (c: OverlapCandidate) =>
    c.target.kind === "edge" ? 0 : c.target.kind === "face" ? 1 : c.target.kind === "body" ? 2 : 3;
  return result.sort(
    (a, b) => a.depth - b.depth || rank(a) - rank(b) || a.key.localeCompare(b.key),
  );
}
