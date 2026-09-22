import * as THREE from "three";
import type { SketchEditor } from "../sketch/editor.js";
import { type Point, type Vector, worldPoint } from "../sketch/planes.js";
import type { Revolution } from "./body.js";
import { pickFace } from "./body-view.js";
import { featureEdges } from "./feature-edges.js";

export type RevolveAxis = Revolution["axis"];
export function axisInPlane(axis: RevolveAxis, center: Vector, normal: Vector): boolean {
  const n = new THREE.Vector3(...normal);
  return (
    Math.abs(n.dot(new THREE.Vector3(...axis.direction))) < 1e-7 &&
    Math.abs(n.dot(new THREE.Vector3(...axis.origin).sub(new THREE.Vector3(...center)))) < 1e-7
  );
}
function distance(p: Point, a: Point, b: Point): number {
  const dx = b.x - a.x,
    dy = b.y - a.y;
  if (dx * dx + dy * dy < 1e-10) return Number.POSITIVE_INFINITY;
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(p.x - a.x - t * dx, p.y - a.y - t * dy);
}
/** Axis picking is distinct from ordinary face/profile selection. */
export function pickRevolveAxis(editor: SketchEditor, point: Point): RevolveAxis | null {
  const segments: [Vector, Vector][] = [];
  for (const body of editor.store.data.bodies ?? []) {
    if (!editor.bodiesVisible || !editor.visibility.visible(body.id)) continue;
    for (const edge of featureEdges(body))
      if (edge.curve?.kind === "line") segments.push([edge.curve.a, edge.curve.b]);
  }
  for (const sketch of editor.store.data.sketches) {
    if (!editor.visibility.visible(sketch.id)) continue;
    for (const curve of sketch.curves)
      if (curve.kind === "segment")
        segments.push([worldPoint(sketch.plane, curve.a), worldPoint(sketch.plane, curve.b)]);
  }
  // Explicit finite edges precede cylindrical faces; world axes are the fallback.
  const finiteCount = segments.length;
  const reach = editor.world.height * 5;
  for (let i = 0; i < 3; i++) {
    const a: Vector = [0, 0, 0],
      b: Vector = [0, 0, 0];
    a[i] = -reach;
    b[i] = reach;
    segments.push([a, b]);
  }
  let best = 9,
    result: RevolveAxis | null = null;
  for (const [index, [a, b]] of segments.entries()) {
    if (index === finiteCount) {
      if (result) break;
      const hit = pickFace(editor, point);
      const cylinder =
        hit &&
        editor.display.bodies
          ?.find((body) => body.id === hit.body)
          ?.faces.find((face) => face.id === hit.face)?.cylinder;
      if (cylinder) return { origin: [...cylinder.origin], direction: [...cylinder.axis] };
    }
    const d = distance(point, editor.world.project(a), editor.world.project(b));
    if (d >= best) continue;
    const direction = new THREE.Vector3(...b).sub(new THREE.Vector3(...a)).normalize();
    if (!direction.lengthSq()) continue;
    best = d;
    result = { origin: a, direction: direction.toArray() as Vector };
  }
  return result;
}
export function revolveFrame(axis: RevolveAxis, center: Vector) {
  const n = new THREE.Vector3(...axis.direction),
    p = new THREE.Vector3(...center);
  const origin = new THREE.Vector3(...axis.origin);
  origin.addScaledVector(n, p.clone().sub(origin).dot(n));
  const radial = p.sub(origin);
  return { origin, n, radial, tangent: n.clone().cross(radial) };
}
export function revolutionPoint(
  axis: RevolveAxis,
  center: Vector,
  angle: number,
  height: number,
): Vector {
  const { origin, n, radial, tangent } = revolveFrame(axis, center);
  const t = (angle * Math.PI) / 180;
  return origin
    .addScaledVector(radial, Math.cos(t))
    .addScaledVector(tangent, Math.sin(t))
    .addScaledVector(n, height)
    .toArray() as Vector;
}
export function angleAt(
  editor: SketchEditor,
  axis: RevolveAxis,
  center: Vector,
  point: Point,
  height: number,
): number | null {
  const { origin, n, radial, tangent } = revolveFrame(axis, center);
  const view = editor.world.camera.position.clone().sub(editor.world.target).normalize();
  if (Math.abs(view.dot(n)) < 0.15) return null;
  const frame = {
    origin: origin.addScaledVector(n, height).toArray() as Vector,
    u: radial.normalize().toArray() as Vector,
    v: tangent.normalize().toArray() as Vector,
  };
  const local = editor.world.pointAt(frame, point.x, point.y);
  return local ? (Math.atan2(local.y, local.x) * 180) / Math.PI : null;
}
