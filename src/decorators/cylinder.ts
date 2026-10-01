import type { BodyGeometry, Face } from "../model/body.js";
import type { PlaneFrame, Vector } from "../sketch/planes.js";
import type { FaceReference } from "./types.js";

export const dot = (a: Vector, b: Vector) => a.reduce((sum, v, i) => sum + v * b[i], 0);
export const subtract = (a: Vector, b: Vector) => a.map((v, i) => v - b[i]) as Vector;
export const cross = (a: Vector, b: Vector): Vector => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
export const unit = (v: Vector) => v.map((n) => n / Math.hypot(...v)) as Vector;
export type Cylinder = NonNullable<Face["cylinder"]>;

export function resolveFaces(
  bodies: readonly BodyGeometry[],
  refs: readonly FaceReference[],
): (Face & { cylinder: Cylinder })[] {
  if (!refs.length) throw new Error("Select cylindrical faces");
  return refs.map(({ body, face }) => {
    const found = bodies.find((b) => b.id === body)?.faces.find((f) => f.id === face);
    if (!found?.cylinder) throw new Error("Decorators require cylindrical faces");
    return { ...found, cylinder: found.cylinder };
  });
}

export function sameCylinder(a: Cylinder, b: Cylinder): boolean {
  return (
    a.outward === b.outward &&
    Math.abs(a.radius - b.radius) < 1e-7 &&
    Math.hypot(...cross(a.axis, b.axis)) < 1e-7 &&
    Math.hypot(...cross(subtract(a.origin, b.origin), a.axis)) < 1e-7
  );
}

export function cylinderFrame(cylinder: Cylinder): PlaneFrame {
  let axis = unit(cylinder.axis);
  const first = axis.find((n) => Math.abs(n) > 1e-7) ?? 1;
  if (first < 0) axis = axis.map((n) => -n) as Vector;
  const radial = unit(cross(axis, Math.abs(axis[0]) < 0.8 ? [1, 0, 0] : [0, 1, 0]));
  const shift = dot(cylinder.origin, axis);
  return {
    origin: cylinder.origin.map((n, i) => n - shift * axis[i]) as Vector,
    u: radial,
    v: cross(axis, radial),
  };
}

export function cylinderCoordinates(frame: PlaneFrame, point: Vector) {
  const delta = subtract(point, frame.origin);
  return {
    angle: Math.atan2(dot(delta, frame.v), dot(delta, frame.u)),
    z: dot(delta, cross(frame.u, frame.v)),
  };
}

export function cylinderPoint(frame: PlaneFrame, angle: number, z: number, radius: number): Vector {
  const axis = cross(frame.u, frame.v);
  return frame.origin.map(
    (n, i) =>
      n + z * axis[i] + radius * (Math.cos(angle) * frame.u[i] + Math.sin(angle) * frame.v[i]),
  ) as Vector;
}

export function cylinderExtent(frame: PlaneFrame, faces: readonly Face[]): [number, number] {
  let low = Infinity,
    high = -Infinity;
  for (const face of faces)
    for (let i = 0; i < face.vertices.length; i += 3) {
      const { z } = cylinderCoordinates(frame, face.vertices.slice(i, i + 3) as Vector);
      low = Math.min(low, z);
      high = Math.max(high, z);
    }
  if (!Number.isFinite(low) || high - low < 1e-7)
    throw new Error("Cylindrical faces have no axial extent");
  return [low, high];
}
