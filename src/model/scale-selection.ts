import type { SketchEditor } from "../sketch/editor.js";
import { type Vector, worldPoint } from "../sketch/planes.js";
import { selectionFrame } from "../sketch/selection-frame.js";
import type { ScaleSource } from "./scale.js";
import { selectionAnchor } from "./selection-anchor.js";

export function scaleSelection(editor: SketchEditor): ScaleSource | null {
  if (editor.world.active) {
    const ids = [...editor.selectedCurves];
    return editor.sketch && ids.length && !editor.selected.points.length
      ? { kind: "curves", sketchId: editor.sketch.id, ids }
      : null;
  }
  const targets = editor.modeling.targets;
  if (targets.length && targets.every((t) => t.kind === "sketch"))
    return { kind: "sketches", ids: [...new Set(targets.map((t) => t.sketch))] };
  const result = editor.modeling.resolve("scale");
  return result.available
    ? {
        kind: "solids",
        ids: result.inputs.bodies.map((b) => b.id),
        faces: result.inputs.faces,
        edges: result.inputs.edges,
      }
    : null;
}
export function scalePivot(editor: SketchEditor): Vector {
  const frame = selectionFrame(editor);
  return editor.world.active && editor.sketch && frame
    ? worldPoint(editor.sketch.plane, frame.center)
    : selectionAnchor(editor);
}
