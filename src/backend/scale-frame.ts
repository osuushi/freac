import { type ScaleOperation, scaleFactors } from "../model/scale.js";
import type { PlaneFrame, Point, Vector } from "../sketch/planes.js";
import { worldPoint } from "../sketch/planes.js";

const dot = (a: Vector, b: Vector) => a.reduce((sum, value, i) => sum + value * b[i], 0);
const unit = (v: Vector): Vector => v.map((x) => x / Math.hypot(...v)) as Vector;

export function scaledSketchFrame(plane: PlaneFrame, operation: ScaleOperation) {
  const factors = scaleFactors(operation);
  if (operation.kind === "curves") {
    const delta = operation.pivot.map((value, i) => value - plane.origin[i]) as Vector;
    const pivot = { x: dot(delta, plane.u), y: dot(delta, plane.v) };
    return {
      plane,
      x: factors[0],
      y: factors[1],
      shear: 0,
      map: (p: Point): Point => ({
        x: pivot.x + factors[0] * (p.x - pivot.x),
        y: pivot.y + factors[1] * (p.y - pivot.y),
      }),
    };
  }
  const vector = (v: Vector): Vector => v.map((x, i) => x * factors[i]) as Vector;
  const u = unit(vector(plane.u));
  const scaledV = vector(plane.v),
    shear = dot(scaledV, u);
  const v = unit(scaledV.map((x, i) => x - shear * u[i]) as Vector);
  const origin = plane.origin.map(
    (x, i) => operation.pivot[i] + factors[i] * (x - operation.pivot[i]),
  ) as Vector;
  const next = { origin, u, v };
  return {
    plane: next,
    x: Math.hypot(...vector(plane.u)),
    y: dot(scaledV, v),
    shear,
    map: (p: Point): Point => {
      const world = worldPoint(plane, p).map(
        (x, i) => operation.pivot[i] + factors[i] * (x - operation.pivot[i]) - origin[i],
      ) as Vector;
      return { x: dot(world, u), y: dot(world, v) };
    },
  };
}
