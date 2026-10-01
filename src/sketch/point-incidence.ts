import { closestOnCurve } from "./curve-geometry.js";
import { newId, type PointReference, type Sketch } from "./document.js";
import { expandedGroups, movePoint, transformSelection } from "./line-edit.js";
import { add, subtract } from "./point-math.js";
import { linkedPointCoordinate } from "./point-reference.js";

export function makePointOnEdge(
  sketch: Sketch,
  point: PointReference,
  edge: string,
  moveEdge = false,
): Sketch {
  const curve = sketch.curves.find((c) => c.id === edge);
  if (curve?.kind === "bezier")
    throw new Error("Cubic point-on-edge constraints are not available yet");
  if (!curve || point.curve === edge) throw new Error("Choose a point and a different edge");
  if (
    sketch.constraints.some(
      (c) =>
        c.kind === "point-on-edge" &&
        c.edge === edge &&
        c.point.curve === point.curve &&
        c.point.end === point.end,
    )
  )
    throw new Error("That coincidence already exists");
  const position = linkedPointCoordinate(sketch, point);
  const target = closestOnCurve(curve, position);
  const moved = moveEdge
    ? transformSelection(sketch, expandedGroups(sketch, new Set([edge])), (p) =>
        add(p, subtract(position, target)),
      )
    : movePoint(sketch, point, target);
  return {
    ...moved,
    constraints: [...moved.constraints, { id: newId(), kind: "point-on-edge", point, edge }],
  };
}
