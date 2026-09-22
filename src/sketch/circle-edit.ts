import { type Circle, newId, type Sketch } from "./document.js";
import type { Point } from "./planes.js";

export function appendCircle(sketch: Sketch, center: Point, radius: number) {
  const curve: Circle = { id: newId(), kind: "circle", center, radius, construction: false };
  return { curve, sketch: { ...sketch, curves: [...sketch.curves, curve] } };
}
export function circleRadius(sketch: Sketch, id: string, radius: number): Sketch {
  if (!Number.isFinite(radius) || radius < 1e-8) throw new Error("Enter a positive radius");
  const found = sketch.curves.find((curve) => curve.id === id);
  if (found?.kind !== "circle") throw new Error("Circle no longer exists");
  return {
    ...sketch,
    curves: sketch.curves.map((curve) => (curve.id === id ? { ...found, radius } : curve)),
  };
}
