import { arcAt, arcCircle, bowRadius, bowThrough } from "./arc-geometry.js";
import { bowDirections } from "./bow-direction.js";
import { constraintCurves } from "./constraint-geometry.js";
import type { Arc, Segment, Sketch } from "./document.js";
import type { SketchEditor } from "./editor.js";
import { editFilletRadius } from "./fillet-edit.js";
import { add, distance, midpoint, scale, subtract } from "./geometry.js";
import { movePoint } from "./line-edit.js";
import type { Point } from "./planes.js";
import { rectangleBowSide } from "./rectangle-bow.js";

export function replaceBow(sketch: Sketch, curve: Segment | Arc): Sketch {
  const source = sketch.curves.find((c) => c.id === curve.id);
  if (source?.kind === "segment" && curve.kind === "arc")
    sketch = {
      ...sketch,
      constraints: sketch.constraints.filter(
        (c) =>
          !constraintCurves(c).includes(curve.id) ||
          ![
            "length",
            "horizontal",
            "vertical",
            "parallel",
            "perpendicular",
            "equal",
            "corner-angle",
            "tangent",
          ].includes(c.kind),
      ),
    };
  const unsupported = sketch.constraints.some(
    (c) =>
      c.kind !== "radius" &&
      !(["tangent", "point-on-edge"].includes(c.kind) && curve.kind === "arc") &&
      constraintCurves(c).includes(curve.id) &&
      (c.kind !== "coincident" ||
        (curve.kind !== "arc" &&
          [c.a, c.b].some((p) => p.curve === curve.id && p.end === "center"))),
  );
  if (unsupported) throw new Error("This constrained edge must be detached before bowing");
  const linkedCenter =
    curve.kind === "arc" &&
    sketch.constraints.some(
      (c) =>
        c.kind === "coincident" &&
        [c.a, c.b].some((p) => p.curve === curve.id && p.end === "center"),
    );
  const moved =
    linkedCenter && curve.kind === "arc"
      ? movePoint(sketch, { curve: curve.id, end: "center" }, arcCircle(curve).center)
      : sketch;
  return { ...moved, curves: moved.curves.map((c) => (c.id === curve.id ? curve : c)) };
}
export function radiusEdit(
  sketch: Sketch,
  curve: Segment | Arc,
  radius: number,
  side: number,
): Sketch {
  if (curve.kind === "arc") {
    const fillet = editFilletRadius(sketch, curve, radius);
    if (fillet) return fillet;
  }
  return replaceBow(sketch, bowRadius(curve, radius, side));
}
export interface BowGuide {
  curve: string;
  side: number;
  point: Point;
  shape: Segment | Arc;
}
export function selectedBowCurves(editor: SketchEditor): (Segment | Arc)[] {
  if (!editor.selected.points.length && editor.selectedCurves.size > 1) {
    const curves = [...editor.selectedCurves].map((id) =>
      editor.sketch?.curves.find((c) => c.id === id),
    );
    if (
      curves.every((c): c is Segment | Arc => !!c && c.kind !== "circle") &&
      editor.sketch &&
      bowDirections(editor.sketch, curves)
    )
      return curves;
    return [];
  }
  const curve = editor.line ?? editor.arc ?? rectangleBowSide(editor);
  return curve ? [curve] : [];
}
export function bowGuides(editor: SketchEditor): BowGuide[] {
  if (
    editor.moveMode ||
    editor.creationArmed ||
    editor.isDragging ||
    (editor.selectedPoint && !editor.selectedPoint.endsWith("/midpoint"))
  )
    return [];
  const curves = selectedBowCurves(editor);
  const unit = editor.world.height / editor.world.canvas.clientHeight;
  const guides = curves.flatMap((curve) => curveGuides(curve, unit));
  if (curves.length < 2 || curves.some((c) => c.kind !== "segment")) return guides;
  const radius = Math.max(
    ...guides.map((g) => (g.shape.kind === "arc" ? arcCircle(g.shape).radius : 0)),
  );
  return guides.map((guide) => {
    const shape = bowRadius(guide.shape, radius, guide.side);
    return { ...guide, shape, point: arcAt(shape, 0.5) };
  });
}
function curveGuides(curve: Segment | Arc, unit: number): BowGuide[] {
  if (curve.kind === "arc")
    return [
      { curve: curve.id, side: -Math.sign(curve.bulge), point: arcAt(curve, 0.5), shape: curve },
    ];
  const chord = subtract(curve.b, curve.a),
    length = distance(curve.a, curve.b);
  const offset = Math.min(length / 6, 16 * unit);
  return [-1, 1].map((side) => {
    const point = add(
      midpoint(curve.a, curve.b),
      scale({ x: -chord.y / length, y: chord.x / length }, offset * side),
    );
    return { curve: curve.id, side, point, shape: bowThrough(curve, point) };
  });
}
