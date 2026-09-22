import { curveDistance } from "./curve-geometry.js";
import { type FilletCorner, filletShape } from "./fillet-geometry.js";
import { distance, dot, subtract } from "./geometry.js";
import type { Point } from "./planes.js";

// Minimize distance to the finite arc, not its midpoint or supporting circle.
// Sampling brackets the separate feasible intervals of curved/consumed supports.
export function filletRadiusAt(c: FilletCorner, point: Point, step = 0): number {
  const offset = subtract(point, c.point);
  const sine = Math.sin(c.half);
  const along = dot(offset, c.bisector);
  const seed = Math.max(0, along / (1 / sine - 1));
  const size = Math.max(distance(point, c.point), c.limit, seed, 1e-5);
  const score = (radius: number): number => {
    if (radius <= 1e-7) return distance(point, c.point);
    try {
      return curveDistance(filletShape(c, radius, "drag"), point);
    } catch {
      return Number.POSITIVE_INFINITY;
    }
  };
  const radii = [0, c.limit, seed];
  // Exact candidates for the unconsumed straight supports, including endpoints.
  const a = 1 / (sine * sine) - 1;
  const b = along / sine;
  const discriminant = b * b - a * dot(offset, offset);
  if (discriminant >= 0)
    radii.push((b - Math.sqrt(discriminant)) / a, (b + Math.sqrt(discriminant)) / a);
  radii.push(dot(offset, c.u) * Math.tan(c.half), dot(offset, c.v) * Math.tan(c.half));
  for (let i = 0; i <= 96; i++) radii.push(size * 10 ** (-6 + i / 12));
  const samples = [...new Set(radii.filter((r) => r >= 0))].sort((a, b) => a - b);
  const values = samples.map(score);
  let best = 0;
  let bestScore = score(0);
  const consider = (radius: number) => {
    const lower = step > 0 ? Math.floor(radius / step) * step : radius;
    for (const candidate of step > 0 ? [lower, lower + step] : [radius]) {
      const value = score(candidate);
      if (value < bestScore) {
        best = candidate;
        bestScore = value;
      }
    }
  };
  for (let i = 0; i < samples.length; i++) {
    consider(samples[i]);
    if (!i || i === samples.length - 1 || !Number.isFinite(values[i])) continue;
    if (values[i] > values[i - 1] || values[i] > values[i + 1]) continue;
    let low = samples[i - 1],
      high = samples[i + 1];
    const ratio = (Math.sqrt(5) - 1) / 2;
    let left = high - ratio * (high - low),
      right = low + ratio * (high - low);
    let l = score(left),
      r = score(right);
    for (let iteration = 0; iteration < 48; iteration++) {
      if (l < r) {
        high = right;
        right = left;
        r = l;
        left = high - ratio * (high - low);
        l = score(left);
      } else {
        low = left;
        left = right;
        l = r;
        right = low + ratio * (high - low);
        r = score(right);
      }
    }
    consider((low + high) / 2);
  }
  return best;
}
