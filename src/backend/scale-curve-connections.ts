import type { Constraint, Curve, PointReference, Sketch } from "../sketch/document.js";

export function scaleCurveConnections(
  sketch: Sketch,
  replacements: Map<string, Curve[]>,
  allocate: (base: string) => string,
): Constraint[] {
  const point = (ref: PointReference): PointReference => {
    const pieces = replacements.get(ref.curve);
    if (!pieces) return ref;
    if (ref.end === "center")
      throw new Error(
        "Transform conflicts with a circular center constraint; remove it before conversion",
      );
    return { curve: ref.end === "a" ? pieces[0].id : pieces[pieces.length - 1].id, end: ref.end };
  };
  const constraints: Constraint[] = sketch.constraints.map((constraint) => {
    if (constraint.kind === "coincident")
      return { ...constraint, a: point(constraint.a), b: point(constraint.b) };
    if (constraint.kind === "point-on-edge" && !replacements.has(constraint.edge))
      return { ...constraint, point: point(constraint.point) };
    const references =
      constraint.kind === "point-on-edge"
        ? [constraint.edge]
        : "curve" in constraint
          ? [constraint.curve]
          : [constraint.a, "b" in constraint ? constraint.b : ""];
    if (references.some((id) => replacements.has(id)))
      throw new Error(
        `Transform conflicts with a ${constraint.kind} constraint on a converted curve; remove it before conversion`,
      );
    return constraint;
  });
  for (const [id, pieces] of replacements) {
    const closed = sketch.curves.find((c) => c.id === id)?.kind === "circle";
    for (let i = 1; i < pieces.length + Number(closed); i++)
      constraints.push({
        id: allocate(`${id}:transform:join:${i}`),
        kind: "coincident",
        a: { curve: pieces[i - 1].id, end: "b" },
        b: { curve: pieces[i % pieces.length].id, end: "a" },
      });
  }
  return constraints;
}
