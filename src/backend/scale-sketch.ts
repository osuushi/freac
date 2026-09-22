import { type ScaleOperation, scalePoint } from "../model/scale.js";
import { type Curve, type Sketch, validateSketch } from "../sketch/document.js";
import type { Point } from "../sketch/planes.js";

type Operation = Extract<ScaleOperation, { kind: "curves" | "sketches" }>;
/** Scale exact curve data, retaining every constraint and identity. */
export function scaleSketch(sketch: Sketch, operation: Operation): Sketch {
  const whole = operation.kind === "sketches";
  const selected = new Set(whole ? sketch.curves.map((c) => c.id) : operation.ids);
  if (
    !whole &&
    (!selected.size ||
      selected.size !== operation.ids.length ||
      operation.ids.some((id) => !sketch.curves.some((c) => c.id === id)))
  )
    throw new Error("Select existing whole curves to scale");
  const offset = operation.pivot.map((value, i) => value - sketch.plane.origin[i]);
  const pivot = whole
    ? { x: 0, y: 0 }
    : {
        x: offset.reduce((sum, value, i) => sum + value * sketch.plane.u[i], 0),
        y: offset.reduce((sum, value, i) => sum + value * sketch.plane.v[i], 0),
      };
  const factor = operation.factor;
  const map = (point: Point): Point => ({
    x: pivot.x + factor * (point.x - pivot.x),
    y: pivot.y + factor * (point.y - pivot.y),
  });
  const curves = sketch.curves.map((curve): Curve => {
    if (!selected.has(curve.id)) return curve;
    if (curve.kind === "circle")
      return { ...curve, center: map(curve.center), radius: curve.radius * factor };
    const endpoints = { ...curve, a: map(curve.a), b: map(curve.b) };
    return curve.kind === "bezier"
      ? { ...endpoints, kind: "bezier", c1: map(curve.c1), c2: map(curve.c2) }
      : endpoints;
  });
  const result: Sketch = {
    ...sketch,
    curves,
    plane: whole
      ? { ...sketch.plane, origin: scalePoint(sketch.plane.origin, operation.pivot, factor) }
      : sketch.plane,
  };
  try {
    validateSketch(result);
  } catch (error) {
    throw new Error(
      `Scale conflicts with sketch constraints: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  return result;
}
