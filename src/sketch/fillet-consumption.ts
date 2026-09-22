import {
  type Arc,
  type Constraint,
  type PointReference,
  type Sketch,
  validateSketch,
} from "./document.js";
import type { FilletCorner } from "./fillet-geometry.js";

// Transfer only the far endpoint: the old corner has been removed by rounding.
export function consumedFilletConstraints(
  sketch: Sketch,
  corner: FilletCorner,
  arc: Arc,
  solved = true,
): Constraint[] {
  const replacements = new Map<string, PointReference>();
  for (const [line, end, arcEnd] of [
    [corner.a, corner.aEnd, "a"],
    [corner.b, corner.bEnd, "b"],
  ] as const) {
    if (!sketch.curves.some((c) => c.id === line.id))
      replacements.set(`${line.id}/${end === "a" ? "b" : "a"}`, { curve: arc.id, end: arcEnd });
  }
  const point = (p: PointReference) => replacements.get(`${p.curve}/${p.end}`) ?? p;
  if (!solved && replacements.size === 0) return [...sketch.constraints];
  const ids = new Set(sketch.curves.map((c) => c.id));
  const constraints: Constraint[] = [];
  for (const original of sketch.constraints) {
    const c =
      original.kind === "coincident"
        ? { ...original, a: point(original.a), b: point(original.b) }
        : original.kind === "point-on-edge"
          ? { ...original, point: point(original.point) }
          : original;
    const references =
      c.kind === "coincident"
        ? [c.a.curve, c.b.curve]
        : c.kind === "point-on-edge"
          ? [c.point.curve, c.edge]
          : "curve" in c
            ? [c.curve]
            : "b" in c
              ? [c.a, c.b]
              : [c.a];
    if (references.some((id) => !ids.has(id))) continue;
    try {
      validateSketch({ ...sketch, constraints: [...constraints, c], groups: [] }, solved);
      constraints.push(c);
    } catch {
      // Relationships to consumed lines cannot survive; valid far-end links can.
    }
  }
  return constraints;
}
