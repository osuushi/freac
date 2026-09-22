import { bowThrough } from "../sketch/arc-geometry.js";
import { drawingAttachment } from "../sketch/creation-links.js";
import { type Curve, newId, type Sketch } from "../sketch/document.js";
import { distance } from "../sketch/geometry.js";
import type { PlaneFrame, Point, Vector } from "../sketch/planes.js";
import type { Edge } from "./body.js";

function local(frame: PlaneFrame, p: Vector): Point {
  const delta = p.map((v, i) => v - frame.origin[i]);
  const x = delta.reduce((sum, v, i) => sum + v * frame.u[i], 0);
  const y = delta.reduce((sum, v, i) => sum + v * frame.v[i], 0);
  if (Math.hypot(...delta.map((v, i) => v - frame.u[i] * x - frame.v[i] * y)) > 1e-6)
    throw new Error("Choose an edge in this sketch plane");
  return { x, y };
}
export function edgeCurve(edge: Edge, frame: PlaneFrame): Curve {
  const curve = edge.curve;
  if (!curve) throw new Error("This edge is not a line or circular arc");
  if (curve.kind === "circle") {
    if (
      Math.abs(curve.normal.reduce((s, v, i) => s + v * frame.u[i], 0)) > 1e-7 ||
      Math.abs(curve.normal.reduce((s, v, i) => s + v * frame.v[i], 0)) > 1e-7
    )
      throw new Error("Choose a circle in this sketch plane");
    return {
      id: edge.id,
      kind: "circle",
      center: local(frame, curve.center),
      radius: curve.radius,
      construction: false,
    };
  }
  const segment = {
    id: edge.id,
    kind: "segment" as const,
    a: local(frame, curve.a),
    b: local(frame, curve.b),
    construction: false,
  };
  return curve.kind === "arc" ? bowThrough(segment, local(frame, curve.mid)) : segment;
}
export function copyEdge(sketch: Sketch, edge: Edge, attach = true): Sketch {
  const curve = { ...edgeCurve(edge, sketch.plane), id: newId() };
  const duplicate = sketch.curves.some((other) => {
    if (other.kind === "circle" || curve.kind === "circle")
      return (
        other.kind === "circle" &&
        curve.kind === "circle" &&
        distance(other.center, curve.center) < 1e-7 &&
        Math.abs(other.radius - curve.radius) < 1e-7
      );
    if (other.kind !== curve.kind) return false;
    const same = distance(other.a, curve.a) < 1e-7 && distance(other.b, curve.b) < 1e-7;
    const reversed = distance(other.a, curve.b) < 1e-7 && distance(other.b, curve.a) < 1e-7;
    return (
      (same || reversed) &&
      (other.kind !== "arc" ||
        curve.kind !== "arc" ||
        Math.abs(other.bulge - (same ? curve.bulge : -curve.bulge)) < 1e-7)
    );
  });
  if (duplicate) return sketch;
  let result: Sketch = { ...sketch, curves: [...sketch.curves, curve] };
  if (attach && curve.kind !== "circle")
    for (const end of ["a", "b"] as const) {
      const attachment = drawingAttachment(sketch, curve[end]);
      if (!attachment) continue;
      const point = { curve: curve.id, end };
      result = {
        ...result,
        constraints: [
          ...result.constraints,
          attachment.kind === "coincident"
            ? { id: newId(), kind: "coincident", a: point, b: attachment.peer }
            : { id: newId(), kind: "point-on-edge", point, edge: attachment.edge },
        ],
      };
    }
  return result;
}
