import { curveBounds } from "./curve-geometry.js";
import type { Sketch } from "./document.js";
import { type PlaneFrame, type Vector, worldPoint } from "./planes.js";

export type PlacementAxis = "X" | "Y" | "Z";
export function sketchCenter(sketch: Sketch): Vector {
  const points = sketch.curves.flatMap(curveBounds);
  if (!points.length) return [...sketch.plane.origin];
  return worldPoint(sketch.plane, {
    x: (Math.min(...points.map((p) => p.x)) + Math.max(...points.map((p) => p.x))) / 2,
    y: (Math.min(...points.map((p) => p.y)) + Math.max(...points.map((p) => p.y))) / 2,
  });
}
export function placedFrame(
  sketch: Sketch,
  axis: PlacementAxis,
  rotate: boolean,
  value: number,
  pivot: Vector = sketchCenter(sketch),
): PlaneFrame {
  if (!Number.isFinite(value)) throw new Error("Enter a finite placement value");
  const index = ({ X: 0, Y: 1, Z: 2 } as const)[axis];
  if (!rotate) {
    const origin: Vector = [...sketch.plane.origin];
    origin[index] += value;
    return { ...sketch.plane, origin };
  }
  const angle = (value * Math.PI) / 180,
    c = Math.cos(angle),
    s = Math.sin(angle);
  const rotation = (point: Vector): Vector => {
    const result: Vector = [...point],
      a = (index + 1) % 3,
      b = (index + 2) % 3;
    result[a] = point[a] * c - point[b] * s;
    result[b] = point[a] * s + point[b] * c;
    return result;
  };
  const offset = rotation(sketch.plane.origin.map((v, i) => v - pivot[i]) as Vector);
  return {
    origin: offset.map((v, i) => v + pivot[i]) as Vector,
    u: rotation(sketch.plane.u),
    v: rotation(sketch.plane.v),
  };
}
