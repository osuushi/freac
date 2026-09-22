import * as THREE from "three";
import type { SketchEditor } from "../sketch/editor.js";
import type { PlaneFrame, Point, Vector } from "../sketch/planes.js";
import { pickFace } from "./body-view.js";
import type { MirrorLine, MirrorPlane } from "./mirror.js";

export type MirrorReference =
  | { kind: "line"; line: MirrorLine; segment?: [Point, Point] }
  | { kind: "plane"; plane: MirrorPlane; vertices?: number[] };
export function planeReference(frame: PlaneFrame): Extract<MirrorReference, { kind: "plane" }> {
  return {
    kind: "plane",
    plane: {
      origin: [...frame.origin],
      normal: new THREE.Vector3(...frame.u)
        .cross(new THREE.Vector3(...frame.v))
        .toArray() as Vector,
    },
  };
}
export function offsetReference(reference: MirrorReference, offset: number): MirrorReference {
  if (reference.kind === "plane") {
    const { origin, normal } = reference.plane;
    return {
      kind: "plane",
      plane: { normal, origin: origin.map((v, i) => v + normal[i] * offset) as Vector },
    };
  }
  const { origin, direction: d } = reference.line,
    length = Math.hypot(d.x, d.y);
  return {
    kind: "line",
    line: {
      direction: d,
      origin: { x: origin.x - (d.y / length) * offset, y: origin.y + (d.x / length) * offset },
    },
  };
}
export function pickMirrorReference(editor: SketchEditor, screen: Point): MirrorReference | null {
  if (!editor.world.active) {
    const hit = pickFace(editor, screen);
    const face =
      hit &&
      editor.display.bodies?.find((b) => b.id === hit.body)?.faces.find((f) => f.id === hit.face);
    return face?.plane ? { ...planeReference(face.plane), vertices: face.vertices } : null;
  }
  const sketch = editor.sketch;
  if (!sketch) return null;
  let best = 9,
    result: MirrorReference | null = null;
  for (const curve of sketch.curves) {
    if (curve.kind !== "segment") continue;
    const a = editor.world.projectLocal(sketch.plane, curve.a),
      b = editor.world.projectLocal(sketch.plane, curve.b);
    const distance = screenLineDistance(screen, a, b, true);
    if (distance >= best) continue;
    best = distance;
    result = {
      kind: "line",
      segment: [curve.a, curve.b],
      line: { origin: curve.a, direction: { x: curve.b.x - curve.a.x, y: curve.b.y - curve.a.y } },
    };
  }
  if (result) return result;
  const origin = editor.world.projectLocal(sketch.plane, { x: 0, y: 0 });
  const axes = [
    { x: 1, y: 0 },
    { x: 0, y: 1 },
  ]
    .map((direction) => ({
      direction,
      distance: screenLineDistance(
        screen,
        origin,
        editor.world.projectLocal(sketch.plane, direction),
        false,
      ),
    }))
    .sort((a, b) => a.distance - b.distance);
  // At the crossing, move along one axis to disambiguate it.
  if (axes[0].distance >= 9 || Math.abs(axes[0].distance - axes[1].distance) < 1) return null;
  return { kind: "line", line: { origin: { x: 0, y: 0 }, direction: axes[0].direction } };
}

function screenLineDistance(point: Point, a: Point, b: Point, finite: boolean): number {
  const dx = b.x - a.x,
    dy = b.y - a.y,
    length = dx * dx + dy * dy;
  if (length < 1e-10) return Number.POSITIVE_INFINITY;
  let t = ((point.x - a.x) * dx + (point.y - a.y) * dy) / length;
  if (finite) t = Math.max(0, Math.min(1, t));
  return Math.hypot(point.x - a.x - t * dx, point.y - a.y - t * dy);
}
