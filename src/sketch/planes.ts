export type Point = { x: number; y: number };
export type Vector = [number, number, number];
export type PlaneId = "XY" | "XZ" | "YZ";
export interface PlaneFrame {
  origin: Vector;
  u: Vector;
  v: Vector;
}
export const planes: Record<PlaneId, PlaneFrame> = {
  XY: { origin: [0, 0, 0], u: [1, 0, 0], v: [0, 1, 0] },
  XZ: { origin: [0, 0, 0], u: [1, 0, 0], v: [0, 0, 1] },
  YZ: { origin: [0, 0, 0], u: [0, 1, 0], v: [0, 0, 1] },
};
export const planeIds: PlaneId[] = ["XY", "XZ", "YZ"];
export function worldPoint(frame: PlaneFrame, point: Point): Vector {
  return frame.origin.map(
    (value, i) => value + frame.u[i] * point.x + frame.v[i] * point.y,
  ) as Vector;
}

export function coplanar(a: PlaneFrame, b: PlaneFrame): boolean {
  const normal: Vector = [
    a.u[1] * a.v[2] - a.u[2] * a.v[1],
    a.u[2] * a.v[0] - a.u[0] * a.v[2],
    a.u[0] * a.v[1] - a.u[1] * a.v[0],
  ];
  const dot = (left: Vector, right: Vector) =>
    left.reduce((sum, value, i) => sum + value * right[i], 0);
  const offset: Vector = b.origin.map((value, i) => value - a.origin[i]) as Vector;
  return [b.u, b.v, offset].every((vector) => Math.abs(dot(normal, vector)) < 1e-7);
}

export function validateFrame(frame: PlaneFrame): void {
  if (
    ![frame.origin, frame.u, frame.v].every(
      (v) => Array.isArray(v) && v.length === 3 && v.every(Number.isFinite),
    )
  )
    throw new Error("A sketch plane needs finite three-dimensional vectors");
  if (
    Math.abs(Math.hypot(...frame.u) - 1) > 1e-7 ||
    Math.abs(Math.hypot(...frame.v) - 1) > 1e-7 ||
    Math.abs(frame.u.reduce((sum, v, i) => sum + v * frame.v[i], 0)) > 1e-7
  )
    throw new Error("A sketch plane needs perpendicular unit axes");
}
