import type { Curve, PointReference, Sketch } from "./document.js";
import { distance } from "./geometry.js";
import type { Point } from "./planes.js";
import { fusePoints, linkedPointCoordinate } from "./point-links.js";

export function newTrimEndpoints(source: Curve, pieces: Curve[]) {
  return pieces.flatMap((curve) =>
    curve.kind === "circle"
      ? []
      : (["a", "b"] as const)
          .filter(
            (end) =>
              source.kind === "circle" ||
              [source.a, source.b].every((p) => distance(p, curve[end]) > 1e-7),
          )
          .map((end) => ({ curve: curve.id, end, coordinate: curve[end] })),
  );
}

/** Only new, unambiguous endpoint junctions created by this rewrite become fused. */
export function fuseTrimCorners(
  changed: Sketch,
  created: (PointReference & { coordinate: Point })[],
): Sketch {
  const endpoints = changed.curves.flatMap((curve): PointReference[] =>
    curve.kind === "circle" ? [] : (["a", "b"] as const).map((end) => ({ curve: curve.id, end })),
  );
  let result = changed;
  for (const point of endpoints) {
    const coordinate = linkedPointCoordinate(changed, point);
    if (
      !created.some(
        (p) =>
          p.curve === point.curve &&
          p.end === point.end &&
          distance(p.coordinate, coordinate) <= 1e-7,
      )
    )
      continue;
    const meeting = endpoints.filter(
      (other) =>
        other.curve !== point.curve &&
        distance(coordinate, linkedPointCoordinate(changed, other)) <= 1e-7,
    );
    if (meeting.length === 1) result = fusePoints(result, [point, meeting[0]]);
  }
  return result;
}
