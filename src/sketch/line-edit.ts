import { arcCircle } from "./arc-geometry.js";
import { moveBezierEnds } from "./bezier-geometry.js";
import type { PointReference, Sketch } from "./document.js";
import { distance, segment } from "./geometry.js";
import type { Point } from "./planes.js";

export function appendLine(sketch: Sketch, start: Point, end: Point) {
  const curve = segment(start, end);
  return { curve, sketch: { ...sketch, curves: [...sketch.curves, curve] } };
}
export function coincidentPoints(sketch: Sketch, endpoint: PointReference): PointReference[] {
  const found = new Map([[`${endpoint.curve}/${endpoint.end}`, endpoint]]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const constraint of sketch.constraints) {
      if (constraint.kind !== "coincident") continue;
      const a = `${constraint.a.curve}/${constraint.a.end}`,
        b = `${constraint.b.curve}/${constraint.b.end}`;
      if (found.has(a) === found.has(b)) continue;
      found.set(a, constraint.a);
      found.set(b, constraint.b);
      changed = true;
    }
  }
  return [...found.values()];
}
export function movePoint(sketch: Sketch, endpoint: PointReference, target: Point): Sketch {
  const linked = coincidentPoints(sketch, endpoint);
  return {
    ...sketch,
    curves: sketch.curves.map((curve) => {
      if (curve.kind === "circle")
        return linked.some((p) => p.curve === curve.id && p.end === "center")
          ? { ...curve, center: target }
          : curve;
      if (curve.kind === "arc" && linked.some((p) => p.curve === curve.id && p.end === "center")) {
        const center = arcCircle(curve).center;
        const translate = (p: Point) => ({
          x: p.x + target.x - center.x,
          y: p.y + target.y - center.y,
        });
        return { ...curve, a: translate(curve.a), b: translate(curve.b) };
      }
      const a = linked.some((item) => item.curve === curve.id && item.end === "a");
      const b = linked.some((item) => item.curve === curve.id && item.end === "b");
      if (curve.kind === "bezier")
        return moveBezierEnds(curve, a ? target : curve.a, b ? target : curve.b);
      return a || b ? { ...curve, a: a ? target : curve.a, b: b ? target : curve.b } : curve;
    }),
  };
}
export function lineDimension(
  sketch: Sketch,
  id: string,
  quantity: "length" | "angle",
  value: number,
): Sketch {
  const curve = sketch.curves.find((item) => item.id === id);
  if (curve?.kind !== "segment") throw new Error("Line no longer exists");
  if (!Number.isFinite(value) || (quantity === "length" && value <= 0))
    throw new Error("Enter a valid line dimension");
  const length = quantity === "length" ? value : distance(curve.a, curve.b);
  const angle =
    quantity === "angle"
      ? (value * Math.PI) / 180
      : Math.atan2(curve.b.y - curve.a.y, curve.b.x - curve.a.x);
  return movePoint(
    sketch,
    { curve: id, end: "b" },
    { x: curve.a.x + length * Math.cos(angle), y: curve.a.y + length * Math.sin(angle) },
  );
}
export function expandedGroups(sketch: Sketch, selection: ReadonlySet<string>): Set<string> {
  const ids = new Set(selection);
  for (const group of sketch.groups)
    if (group.members.some((id) => ids.has(id))) for (const id of group.members) ids.add(id);
  return ids;
}
export function transformSelection(
  sketch: Sketch,
  ids: ReadonlySet<string>,
  map: (point: Point) => Point,
): Sketch {
  let result = sketch;
  for (const curve of sketch.curves) {
    if (!ids.has(curve.id)) continue;
    if (curve.kind === "circle") {
      result = movePoint(result, { curve: curve.id, end: "center" }, map(curve.center));
      continue;
    }
    result = movePoint(result, { curve: curve.id, end: "a" }, map(curve.a));
    result = movePoint(result, { curve: curve.id, end: "b" }, map(curve.b));
  }
  result = {
    ...result,
    curves: result.curves.map((c) => {
      const original = sketch.curves.find((v) => v.id === c.id);
      return c.kind === "bezier" && original?.kind === "bezier" && ids.has(c.id)
        ? { ...c, c1: map(original.c1), c2: map(original.c2) }
        : c;
    }),
  };
  return result;
}
