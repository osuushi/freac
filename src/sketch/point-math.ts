import type { Point } from "./planes.js";

export const add = (a: Point, b: Point): Point => ({ x: a.x + b.x, y: a.y + b.y });
export const subtract = (a: Point, b: Point): Point => ({ x: a.x - b.x, y: a.y - b.y });
export const scale = (point: Point, factor: number): Point => ({
  x: point.x * factor,
  y: point.y * factor,
});
export const dot = (a: Point, b: Point): number => a.x * b.x + a.y * b.y;
export const distance = (a: Point, b: Point): number => Math.hypot(a.x - b.x, a.y - b.y);
export const midpoint = (a: Point, b: Point): Point => scale(add(a, b), 0.5);
export function segmentDistance(point: Point, a: Point, b: Point): number {
  const v = subtract(b, a),
    denominator = dot(v, v);
  const t = denominator ? Math.max(0, Math.min(1, dot(subtract(point, a), v) / denominator)) : 0;
  return distance(point, add(a, scale(v, t)));
}
