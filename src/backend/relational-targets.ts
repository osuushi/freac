import { numericConstraints, numericValue } from "../sketch/constraint-geometry.js";
import type { Sketch } from "../sketch/document.js";
import type { EditIntent } from "../sketch/edit-intent.js";
import { connectedSelection, distance } from "../sketch/geometry.js";
import { coincidentPoints } from "../sketch/line-edit.js";
import { tangentJunction } from "../sketch/tangent-junction.js";
import { intentTargets } from "./intent-targets.js";
import { curvePoints, solverLayout } from "./solver-geometry.js";
import type { Equation, SolverInput } from "./solver-input.js";

// Only active edit targets enter the lower-priority system. Other related edges
// remain solver unknowns, not a second set of coordinate locks.
export function relationalTargets(
  target: Sketch,
  previous: Sketch | undefined,
  input: SolverInput,
  index: (id: string) => number,
  intent: EditIntent,
  handled: ReadonlySet<string>,
): SolverInput {
  const { curves } = solverLayout(target);
  const { changed, moved, freeCenters, exact } = intentTargets(target, previous, intent);
  const subject = intent.kind === "pair" ? intent.subject : null;
  const reference = intent.kind === "pair" ? intent.reference : null;
  if (subject) changed.add(subject);
  const related = connectedSelection(target, changed);
  const fixed = new Set<number>();
  const targets: Equation[] = [];
  for (const curve of curves) {
    if (handled.has(curve.id)) continue;
    const a = index(curve.id);
    for (const offset of curvePoints(curve).keys()) {
      const i = a + offset;
      if (
        !related.has(curve.id) ||
        curve.id === reference ||
        (changed.has(curve.id) && !moved.has(i) && !freeCenters.has(i))
      ) {
        fixed.add(i);
      } else if (moved.has(i) || subject === curve.id) {
        targets.push(
          { kind: "x", a: i, value: input.points[i].x, temporary: true },
          { kind: "y", a: i, value: input.points[i].y, temporary: true },
        );
      }
    }
  }
  for (const lock of numericConstraints(target)) {
    if (lock.kind !== "length" || handled.has(lock.curve)) continue;
    const a = index(lock.curve);
    input.constraints.push({ kind: "distance", a, b: a + 1, value: lock.value });
  }
  anchorMeetingAngles(target, fixed, index);
  for (const c of target.constraints) {
    if (c.kind !== "tangent") continue;
    const junction = tangentJunction(target, c);
    if (!junction) continue;
    if (
      coincidentPoints(target, { curve: c.a, end: junction.aEnd }).some(
        (p) => p.curve === c.b && p.end === junction.bEnd,
      )
    )
      continue;
    fixed.add(index(c.a) + (junction.aEnd === "b" ? 1 : 0));
    fixed.add(index(c.b) + (junction.bEnd === "b" ? 1 : 0));
  }
  fixDeterminedArcs(target, input.curveRadii ?? {}, fixed, index);
  input.fixed = [...fixed];
  input.exact = exact.filter(
    (i) => !curves.some((c) => handled.has(c.id) && i >= index(c.id) && i < index(c.id) + 2),
  );
  const fixedRadii = Object.entries(input.curveRadii ?? {})
    .filter(([id]) => {
      const curve = curves.find((c) => c.id === id);
      return (
        curve?.kind === "circle" ||
        numericConstraints(target).some((lock) => lock.kind === "radius" && lock.curve === id) ||
        (curve && curvePoints(curve).every((_, offset) => fixed.has(index(id) + offset)))
      );
    })
    .map(([, radius]) => radius);
  input.fixedRadii = fixedRadii;
  const handledPoints = new Set([...handled].flatMap((id) => [index(id), index(id) + 1]));
  input.constraints = input.constraints.filter((c) => {
    if (c.kind === "radius") return !fixedRadii.includes(c.a);
    if (equationPoints(c).some((i) => handledPoints.has(i))) return true;
    if (
      c.kind === "tangent-circles" &&
      (!fixedRadii.includes(c.radius ?? -1) || !fixedRadii.includes(c.otherRadius ?? -1))
    )
      return true;
    if (c.kind === "tangent-line" && !fixedRadii.includes(c.radius ?? -1)) return true;
    if (c.kind === "on-circle" && !fixedRadii.includes(c.radius ?? -1)) return true;
    return equationPoints(c).some((i) => !fixed.has(i));
  });
  input.constraints.push(...targets.filter((c) => !fixed.has(c.a)));
  return input;
}
function equationPoints(e: Equation): number[] {
  if (e.kind === "tangent-normal") return [e.a, e.b ?? 0, e.c ?? 0, e.d ?? 0];
  if (e.kind === "on-line") return [e.a, e.b ?? 0, (e.b ?? 0) + 1];
  if (e.kind === "tangent-line") return [e.a, e.a + 1, e.b ?? 0];
  if (e.kind === "horizontal" || e.kind === "vertical") return [e.a, e.a + 1];
  if (
    e.kind === "corner-angle" ||
    e.kind === "parallel" ||
    e.kind === "perpendicular" ||
    e.kind === "equal"
  )
    return [e.a, e.a + 1, e.b ?? 0, (e.b ?? 0) + 1];
  return e.b === undefined ? [e.a] : [e.a, e.b];
}

function fixDeterminedArcs(
  target: Sketch,
  curveRadii: Record<string, number>,
  fixed: Set<number>,
  index: (id: string) => number,
): void {
  for (const lock of numericConstraints(target)) {
    const curve = target.curves.find((c) => c.id === lock.curve);
    if (lock.kind !== "radius" || curve?.kind !== "arc" || curveRadii[curve.id] === undefined)
      continue;
    const i = index(curve.id);
    // Fixed endpoints + radius + selected branch determine the center, including
    // the singular 180-degree position. Other linked geometry still solves normally.
    if (
      fixed.has(i) &&
      fixed.has(i + 1) &&
      Math.abs(numericValue(curve, "radius") - lock.value) < 1e-7
    )
      fixed.add(i + 2);
  }
}

function anchorMeetingAngles(
  target: Sketch,
  fixed: Set<number>,
  index: (id: string) => number,
): void {
  for (const c of target.constraints) {
    if (c.kind !== "corner-angle") continue;
    const a = target.curves.find((p) => p.id === c.a),
      b = target.curves.find((p) => p.id === c.b);
    if (a?.kind !== "segment" || b?.kind !== "segment" || distance(a[c.aEnd], b[c.bEnd]) > 1e-7)
      continue;
    // An angle edit keeps its meeting location. This is a temporary anchor,
    // not an implicit coincidence: detached targets stay detached.
    fixed.add(index(c.a) + (c.aEnd === "b" ? 1 : 0));
    fixed.add(index(c.b) + (c.bEnd === "b" ? 1 : 0));
  }
}
