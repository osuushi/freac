import { closestOnCurve, curveDistance } from "./curve-geometry.js";
import { newId, type PointReference, type Sketch } from "./document.js";
import { add, subtract } from "./geometry.js";
import { expandedGroups, movePoint, transformSelection } from "./line-edit.js";
import { linkedPointCoordinate } from "./point-links.js";

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
export function validateIncidence(
  sketch: Sketch,
  point: PointReference,
  edge: string,
  solved: boolean,
): void {
  const curve = sketch.curves.find((c) => c.id === edge);
  const position = linkedPointCoordinate(sketch, point);
  if (curve?.kind === "bezier")
    throw new Error("Cubic point-on-edge constraints are not available yet");
  if (!curve || point.curve === edge) throw new Error("Invalid point/edge coincidence");
  if (solved && curveDistance(curve, position) > 1e-7)
    throw new Error("Coincident point must lie on the visible edge");
}
