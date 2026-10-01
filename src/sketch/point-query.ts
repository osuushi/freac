import { arcAt, arcCircle } from "./arc-geometry.js";
import { bezierAt } from "./bezier-geometry.js";
import type { EditingGroup, Sketch } from "./document.js";
import { midpoint } from "./point-math.js";
import { rectangleFrame } from "./rectangle-edit.js";
import { type PointTarget, pointTarget, targetKey } from "./selection-target.js";
import type { Hit, PointHit } from "./sketch-hit.js";

export function pointKey(hit: Hit | null): string | null {
  const target = hit && pointTarget(hit);
  return target ? targetKey(target) : null;
}

export function rectangleHandles(sketch: Sketch, group: EditingGroup) {
  const frame = rectangleFrame(sketch, group);
  return [
    ...frame.corners.map((point, index) => ({ point, handle: { kind: "corner" as const, index } })),
    ...frame.corners.map((point, index) => ({
      point: midpoint(point, frame.corners[(index + 1) % 4]),
      handle: { kind: "edge" as const, index },
    })),
  ];
}

export function pointHits(sketch: Sketch): PointHit[] {
  const points: PointHit[] = sketch.curves.flatMap((curve): PointHit[] => {
    const group = sketch.groups.find((item) => item.members.includes(curve.id));
    if (group) return [];
    if (curve.kind === "circle")
      return [{ kind: "circleCenter", curve: curve.id, point: curve.center }];
    if (curve.kind === "arc")
      return [
        { kind: "endpoint", endpoint: { curve: curve.id, end: "a" }, point: curve.a },
        { kind: "endpoint", endpoint: { curve: curve.id, end: "b" }, point: curve.b },
        { kind: "circleCenter", curve: curve.id, point: arcCircle(curve).center },
        { kind: "midpoint", curve: curve.id, point: arcAt(curve, 0.5) },
      ];
    return [
      { kind: "endpoint", endpoint: { curve: curve.id, end: "a" }, point: curve.a },
      { kind: "endpoint", endpoint: { curve: curve.id, end: "b" }, point: curve.b },
      {
        kind: "midpoint",
        curve: curve.id,
        point: curve.kind === "bezier" ? bezierAt(curve, 0.5) : midpoint(curve.a, curve.b),
      },
    ];
  });
  for (const group of sketch.groups) {
    for (const { point, handle } of rectangleHandles(sketch, group))
      points.push({ kind: "handle", group, handle, point });
    points.push({ kind: "center", group, point: rectangleFrame(sketch, group).center });
  }
  return points;
}

export function resolvePointTargets(sketch: Sketch, targets: readonly PointTarget[]): PointHit[] {
  const available = pointHits(sketch);
  return targets.flatMap((target) => {
    const hit = available.find((point) => pointKey(point) === targetKey(target));
    return hit ? [hit] : [];
  });
}
