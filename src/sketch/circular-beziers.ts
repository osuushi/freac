import { arcCircle, arcDomain } from "./arc-geometry.js";
import type { Arc, Bezier, Circle } from "./document.js";
import type { Point } from "./planes.js";

/** Maximum position error in final sketch millimetres, independent of zoom. */
export const transformCurveTolerance = 1e-3;

export function circularBeziers(
  curve: Circle | Arc,
  map: (point: Point) => Point,
  stretch: number,
  id: (index: number) => string,
): Bezier[] {
  const circle = curve.kind === "arc" ? arcCircle(curve) : curve;
  const { start, sweep } =
    curve.kind === "arc" ? arcDomain(curve) : { start: 0, sweep: 2 * Math.PI };
  // Cubic Hermite interpolation: each coordinate's remainder is bounded by
  // max|f''''| h^4 / 384. sqrt(2) bounds the vector error after the affine map.
  const step = Math.min(
    Math.PI / 2,
    ((384 * transformCurveTolerance) / (Math.SQRT2 * circle.radius * stretch)) ** 0.25,
  );
  const count = Math.ceil(Math.abs(sweep) / step);
  if (!Number.isFinite(count) || count > 4096)
    throw new Error("Transform requires too many curve segments at the approximation tolerance");
  const h = sweep / count;
  const point = (angle: number): Point => ({
    x: circle.center.x + circle.radius * Math.cos(angle),
    y: circle.center.y + circle.radius * Math.sin(angle),
  });
  const points = Array.from({ length: count + 1 }, (_, i) => point(start + i * h));
  if (curve.kind === "arc") {
    points[0] = curve.a;
    points[count] = curve.b;
  } else points[count] = points[0];
  return Array.from({ length: count }, (_, i) => {
    const a = points[i],
      b = points[i + 1];
    const first = start + i * h,
      last = first + h;
    return {
      id: id(i),
      kind: "bezier",
      construction: curve.construction,
      a: map(a),
      b: map(b),
      c1: map({
        x: a.x - (circle.radius * Math.sin(first) * h) / 3,
        y: a.y + (circle.radius * Math.cos(first) * h) / 3,
      }),
      c2: map({
        x: b.x + (circle.radius * Math.sin(last) * h) / 3,
        y: b.y - (circle.radius * Math.cos(last) * h) / 3,
      }),
    };
  });
}
