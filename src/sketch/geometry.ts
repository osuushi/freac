import { constraintCurves } from "./constraint-geometry.js";
import { type EditingGroup, newId, type Segment, type Sketch } from "./document.js";
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
export function segment(a: Point, b: Point): Segment {
  return { id: newId(), kind: "segment", a, b, construction: false };
}
export function rectangle(
  sketch: Sketch,
  start: Point,
  end: Point,
): { sketch: Sketch; group: EditingGroup } {
  const points = [start, { x: end.x, y: start.y }, end, { x: start.x, y: end.y }];
  const curves = points.map((a, i) => segment(a, points[(i + 1) % 4]));
  const group: EditingGroup = {
    id: newId(),
    kind: "rectangle",
    members: curves.map((curve) => curve.id),
  };
  const connections = curves.map((curve, i) => ({
    id: newId(),
    kind: "coincident" as const,
    a: { curve: curve.id, end: "b" as const },
    b: { curve: curves[(i + 1) % 4].id, end: "a" as const },
  }));
  return {
    group,
    sketch: {
      ...sketch,
      curves: [...sketch.curves, ...curves],
      groups: [...sketch.groups, group],
      constraints: [
        ...sketch.constraints,
        ...connections,
        { id: newId(), kind: "parallel", a: curves[0].id, b: curves[2].id },
        { id: newId(), kind: "parallel", a: curves[1].id, b: curves[3].id },
        { id: newId(), kind: "perpendicular", a: curves[0].id, b: curves[1].id },
      ],
    },
  };
}
export function groupCurves(sketch: Sketch, group: EditingGroup): Segment[] {
  return group.members.map((id) => {
    const curve = sketch.curves.find((item) => item.id === id);
    if (curve?.kind !== "segment") throw new Error("Rectangle requires line segments");
    return curve;
  });
}
export function transform(
  sketch: Sketch,
  ids: ReadonlySet<string>,
  map: (point: Point) => Point,
): Sketch {
  return {
    ...sketch,
    curves: sketch.curves.map((curve) =>
      !ids.has(curve.id)
        ? curve
        : curve.kind === "bezier"
          ? { ...curve, a: map(curve.a), b: map(curve.b), c1: map(curve.c1), c2: map(curve.c2) }
          : curve.kind === "circle"
            ? { ...curve, center: map(curve.center) }
            : { ...curve, a: map(curve.a), b: map(curve.b) },
    ),
  };
}
export function connectedSelection(sketch: Sketch, ids: ReadonlySet<string>): Set<string> {
  const connected = new Set(ids);
  let changed = true;
  while (changed) {
    changed = false;
    for (const constraint of sketch.constraints) {
      const [a, b] = constraintCurves(constraint);
      if (!b) continue;
      if (connected.has(a) === connected.has(b)) continue;
      connected.add(a);
      connected.add(b);
      changed = true;
    }
  }
  return connected;
}
export function removeCurves(sketch: Sketch, ids: ReadonlySet<string>): Sketch {
  return {
    ...sketch,
    curves: sketch.curves.filter((curve) => !ids.has(curve.id)),
    groups: sketch.groups.filter((group) => group.members.every((id) => !ids.has(id))),
    constraints: sketch.constraints.filter((constraint) =>
      constraintCurves(constraint).every((id) => !ids.has(id)),
    ),
  };
}
export function segmentDistance(point: Point, a: Point, b: Point): number {
  const v = subtract(b, a),
    denominator = dot(v, v);
  const t = denominator ? Math.max(0, Math.min(1, dot(subtract(point, a), v) / denominator)) : 0;
  return distance(point, add(a, scale(v, t)));
}
