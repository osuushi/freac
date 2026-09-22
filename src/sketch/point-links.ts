import { arcCircle } from "./arc-geometry.js";
import { newId, type PointReference, type Sketch } from "./document.js";
import { distance } from "./geometry.js";
import { coincidentPoints, movePoint } from "./line-edit.js";

export const endpointKey = (p: PointReference): string => `${p.curve}/${p.end}`;
const intrinsic = (sketch: Sketch, a: PointReference, b: PointReference): boolean =>
  sketch.groups.some((g) => g.members.includes(a.curve) && g.members.includes(b.curve));
export function pointLinked(sketch: Sketch, p: PointReference): boolean {
  return sketch.constraints.some(
    (c) =>
      c.kind === "coincident" &&
      !intrinsic(sketch, c.a, c.b) &&
      [c.a, c.b].some((q) => endpointKey(q) === endpointKey(p)),
  );
}
export function linkedPointCoordinate(sketch: Sketch, p: PointReference) {
  const curve = sketch.curves.find((c) => c.id === p.curve);
  if (p.end === "center" && curve && (curve.kind === "circle" || curve.kind === "arc"))
    return curve.kind === "circle" ? curve.center : arcCircle(curve).center;
  if (p.end !== "center" && curve && curve.kind !== "circle") return curve[p.end];
  throw new Error("Point linking requires a curve endpoint or circle/arc center");
}
export function fusePoints(sketch: Sketch, points: PointReference[]): Sketch {
  const first = points[0];
  if (!first || points.length < 2) throw new Error("Choose at least two points to fuse");
  let result = sketch;
  for (const p of points.slice(1)) {
    if (distance(linkedPointCoordinate(sketch, first), linkedPointCoordinate(sketch, p)) > 1e-7)
      throw new Error("Fuse requires coincident points");
    if (coincidentPoints(result, first).some((q) => endpointKey(p) === endpointKey(q))) continue;
    result = {
      ...result,
      constraints: [...result.constraints, { id: newId(), kind: "coincident", a: first, b: p }],
    };
  }
  return result;
}
export function unfusePoints(sketch: Sketch, points: PointReference[]): Sketch {
  const chosen = new Set(points.map(endpointKey));
  const components: PointReference[][] = [];
  const seen = new Set<string>();
  for (const p of points) {
    if (seen.has(endpointKey(p))) continue;
    const component = coincidentPoints(sketch, p);
    for (const q of component) seen.add(endpointKey(q));
    components.push(component.filter((q) => !chosen.has(endpointKey(q))));
  }
  let result: Sketch = {
    ...sketch,
    constraints: sketch.constraints.filter(
      (c) =>
        c.kind !== "coincident" ||
        intrinsic(sketch, c.a, c.b) ||
        (!chosen.has(endpointKey(c.a)) && !chosen.has(endpointKey(c.b))),
    ),
  };
  // Removing the hub of a spanning tree must not disconnect unselected points.
  for (const remaining of components)
    if (remaining.length > 1) result = fusePoints(result, remaining);
  return result;
}

export function validatePointLinks(sketch: Sketch): void {
  const parent = new Map<string, string>();
  const root = (key: string): string => {
    while (parent.has(key)) key = parent.get(key) ?? key;
    return key;
  };
  for (const c of sketch.constraints) {
    if (c.kind !== "coincident") continue;
    const a = root(endpointKey(c.a)),
      b = root(endpointKey(c.b));
    if (a === b) throw new Error("Redundant point coincidence");
    parent.set(a, b);
  }
}

export function makeCoincident(sketch: Sketch, points: PointReference[]): Sketch {
  if (points.length !== 2) throw new Error("Choose two points for coincidence");
  const [subject, reference] = points;
  const moved = movePoint(sketch, subject, linkedPointCoordinate(sketch, reference));
  return fusePoints(moved, points);
}
