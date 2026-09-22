import { type Constraint, newId, type Sketch } from "./document.js";

function references(c: Constraint): string[] {
  if ("curve" in c) return [c.curve];
  if (c.kind === "point-on-edge") return [c.point.curve, c.edge];
  if (c.kind === "coincident") return [c.a.curve, c.b.curve];
  return "b" in c ? [c.a, c.b] : [c.a];
}

/** Clone only selected curves and their internal relationships. Reuse IDs during previews. */
export function copySelection(
  sketch: Sketch,
  selected: Set<string>,
  ids = new Map<string, string>(),
): Sketch {
  const get = (id: string): string => {
    let copy = ids.get(id);
    if (!copy) {
      copy = newId();
      ids.set(id, copy);
    }
    return copy;
  };
  const constraint = (c: Constraint): Constraint => {
    const id = get(c.id);
    if ("curve" in c) return { ...c, id, curve: get(c.curve) };
    if (c.kind === "point-on-edge")
      return { ...c, id, point: { ...c.point, curve: get(c.point.curve) }, edge: get(c.edge) };
    if (c.kind === "coincident")
      return {
        ...c,
        id,
        a: { ...c.a, curve: get(c.a.curve) },
        b: { ...c.b, curve: get(c.b.curve) },
      };
    return "b" in c ? { ...c, id, a: get(c.a), b: get(c.b) } : { ...c, id, a: get(c.a) };
  };
  const curves = new Map(sketch.curves.map((curve) => [curve.id, curve]));
  return {
    ...sketch,
    curves: [...selected].flatMap((id) => {
      const curve = curves.get(id);
      return curve ? [{ ...curve, id: get(id) }] : [];
    }),
    constraints: sketch.constraints
      .filter((c) => references(c).every((id) => selected.has(id)))
      .map(constraint),
    groups: sketch.groups
      .filter((g) => g.members.every((id) => selected.has(id)))
      .map((g) => ({ ...g, id: get(g.id), members: g.members.map(get) })),
  };
}

export function appendSelection(original: Sketch, copy: Sketch): Sketch {
  return {
    ...original,
    curves: [...original.curves, ...copy.curves],
    constraints: [...original.constraints, ...copy.constraints],
    groups: [...original.groups, ...copy.groups],
  };
}

export function copySketch(sketch: Sketch, ids = new Map<string, string>()): Sketch {
  const copy = copySelection(sketch, new Set(sketch.curves.map((c) => c.id)), ids);
  const id = ids.get(sketch.id) ?? newId();
  ids.set(sketch.id, id);
  return { ...copy, id };
}
