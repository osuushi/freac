import { type MirrorOperation, reflectPoint } from "../model/mirror.js";
import {
  type Constraint,
  type Curve,
  newId,
  type Sketch,
  validateSketch,
} from "../sketch/document.js";

type Operation = Extract<MirrorOperation, { kind: "sketch" }>;
function references(c: Constraint): string[] {
  if ("curve" in c) return [c.curve];
  if (c.kind === "point-on-edge") return [c.point.curve, c.edge];
  if (c.kind === "coincident") return [c.a.curve, c.b.curve];
  return "b" in c ? [c.a, c.b] : [c.a];
}
function reflectedConstraint(c: Constraint, ids: Map<string, string>): Constraint {
  const get = (key: string) => ids.get(key) ?? key;
  if ("curve" in c) return { ...c, curve: get(c.curve) };
  if (c.kind === "point-on-edge")
    return { ...c, point: { ...c.point, curve: get(c.point.curve) }, edge: get(c.edge) };
  if (c.kind === "coincident")
    return { ...c, a: { ...c.a, curve: get(c.a.curve) }, b: { ...c.b, curve: get(c.b.curve) } };
  if (c.kind === "corner-angle") return { ...c, a: get(c.a), b: get(c.b), value: -c.value };
  if (c.kind === "tangent")
    return {
      ...c,
      a: get(c.a),
      b: get(c.b),
      side: typeof c.side === "number" ? (c.side === 1 ? -1 : 1) : c.side,
    };
  return "b" in c ? { ...c, a: get(c.a), b: get(c.b) } : { ...c, a: get(c.a) };
}

/** Reflect exact curve data; validation rejects conflicting external/axis locks without a solve. */
export function mirrorSketch(sketch: Sketch, operation: Operation): Sketch {
  const selected = new Set(operation.ids);
  const originals = new Map(sketch.curves.map((c) => [c.id, c]));
  if (
    !selected.size ||
    selected.size !== operation.ids.length ||
    operation.ids.some((id) => !sketch.curves.some((c) => c.id === id))
  )
    throw new Error("Select existing whole curves to mirror");
  const ids = new Map(operation.ids.map((id) => [id, operation.keepOriginal ? newId() : id]));
  const map = (p: import("../sketch/planes.js").Point) => reflectPoint(p, operation.line);
  const reflected = operation.ids.map((source): Curve => {
    const c = originals.get(source);
    if (!c) throw new Error("Mirror curve no longer exists");
    const id = ids.get(c.id) ?? c.id;
    if (c.kind === "circle") return { ...c, id, center: map(c.center) };
    const endpoints = { ...c, id, a: map(c.a), b: map(c.b) };
    if (c.kind === "arc") return { ...endpoints, kind: "arc", bulge: -c.bulge };
    if (c.kind === "bezier") return { ...endpoints, kind: "bezier", c1: map(c.c1), c2: map(c.c2) };
    return endpoints;
  });
  const internal = (c: Constraint) => references(c).every((id) => selected.has(id));
  const constraints = operation.keepOriginal
    ? [
        ...sketch.constraints,
        ...sketch.constraints
          .filter(internal)
          .map((c) => ({ ...reflectedConstraint(c, ids), id: newId() })),
      ]
    : sketch.constraints.map((c) => (internal(c) ? reflectedConstraint(c, ids) : c));
  const groups = operation.keepOriginal
    ? [
        ...sketch.groups,
        ...sketch.groups
          .filter((g) => g.members.every((id) => selected.has(id)))
          .map((g) => ({ ...g, id: newId(), members: g.members.map((id) => ids.get(id) ?? id) })),
      ]
    : sketch.groups;
  const result = {
    ...sketch,
    curves: operation.keepOriginal
      ? [...sketch.curves, ...reflected]
      : sketch.curves.map((c) => reflected.find((r) => r.id === c.id) ?? c),
    constraints,
    groups,
  };
  try {
    validateSketch(result);
  } catch (error) {
    throw new Error(
      `Mirror conflicts with sketch constraints: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  return result;
}
