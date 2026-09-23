import { type Curve, newId, type Sketch, validateSketch } from "./document.js";
import { distance } from "./geometry.js";

export function sameProjectedCurve(a: Curve, b: Curve): boolean {
  if (a.kind !== b.kind) return false;
  if (a.kind === "circle" || b.kind === "circle")
    return (
      a.kind === "circle" &&
      b.kind === "circle" &&
      distance(a.center, b.center) < 1e-7 &&
      Math.abs(a.radius - b.radius) < 1e-7
    );
  const forward = distance(a.a, b.a) < 1e-7 && distance(a.b, b.b) < 1e-7;
  const reverse = distance(a.a, b.b) < 1e-7 && distance(a.b, b.a) < 1e-7;
  if (!forward && !reverse) return false;
  if (a.kind === "arc" && b.kind === "arc")
    return Math.abs(a.bulge - (forward ? b.bulge : -b.bulge)) < 1e-9;
  if (a.kind === "bezier" && b.kind === "bezier")
    return (
      distance(a.c1, forward ? b.c1 : b.c2) < 1e-7 && distance(a.c2, forward ? b.c2 : b.c1) < 1e-7
    );
  return true;
}
export function projectedSketch(target: Sketch, projected: readonly Curve[]): Sketch {
  const curves = [...target.curves],
    added: Curve[] = [];
  for (const curve of projected) {
    if (curves.some((c) => sameProjectedCurve(c, curve))) continue;
    const copy = { ...curve, id: newId() };
    curves.push(copy);
    added.push(copy);
  }
  if (!added.length) throw new Error("Projection already exists in this sketch");
  const constraints = [...target.constraints];
  const points: { curve: string; end: "a" | "b"; point: { x: number; y: number } }[] = [];
  for (const curve of added)
    if (curve.kind !== "circle")
      for (const end of ["a", "b"] as const) {
        const peer = points.find((p) => distance(p.point, curve[end]) < 1e-7);
        const ref = { curve: curve.id, end };
        if (peer)
          constraints.push({
            id: newId(),
            kind: "coincident",
            a: ref,
            b: { curve: peer.curve, end: peer.end },
          });
        else points.push({ ...ref, point: curve[end] });
      }
  const result = { ...target, curves, constraints };
  validateSketch(result);
  return result;
}
