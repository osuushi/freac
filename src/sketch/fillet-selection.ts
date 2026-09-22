import { selectedCorner } from "./corner-angle-controls.js";
import type { SketchEditor } from "./editor.js";
import { type FilletCorner, filletCorner } from "./fillet-geometry.js";
import { distance } from "./geometry.js";
import { pointBranches, selectedPointHits } from "./point-selection.js";
import type { RoundingCurve } from "./rounding-curves.js";

export function selectedFilletCorner(editor: SketchEditor): FilletCorner | null {
  const sketch = editor.sketch;
  if (!sketch || editor.isDragging) return null;
  const selected = selectedPointHits(editor);
  if (selected.length && selected.every((h) => distance(h.point, selected[0].point) < 1e-7)) {
    const branches = selected
      .flatMap(pointBranches)
      .flatMap((branch) => {
        const line = sketch.curves.find(
          (c): c is RoundingCurve => c.kind !== "circle" && c.id === branch.curve,
        );
        return line && (branch.fraction === 0 || branch.fraction === 1)
          ? [{ line, end: branch.fraction === 0 ? ("a" as const) : ("b" as const) }]
          : [];
      })
      .filter(
        (b, i, all) => all.findIndex((a) => a.line.id === b.line.id && a.end === b.end) === i,
      );
    if (branches.length === 2) {
      try {
        return filletCorner(branches[0].line, branches[1].line, branches[0].end, branches[1].end);
      } catch {
        return null;
      }
    }
    return null;
  }
  const curves = sketch.curves.filter(
    (c): c is RoundingCurve => c.kind !== "circle" && editor.selectedCurves.has(c.id),
  );
  if (curves.length === 2) {
    const corners = (["a", "b"] as const).flatMap((aEnd) =>
      (["a", "b"] as const)
        .filter((bEnd) => distance(curves[0][aEnd], curves[1][bEnd]) <= 1e-7)
        .map((bEnd) => ({ aEnd, bEnd })),
    );
    // Two-curve loops have two corners: select a point to identify which one.
    if (corners.length !== 1) return null;
    try {
      return filletCorner(curves[0], curves[1], corners[0].aEnd, corners[0].bEnd);
    } catch {
      return null;
    }
  }
  const corner = selectedCorner(editor);
  const a = sketch.curves.find((c) => c.id === corner?.a),
    b = sketch.curves.find((c) => c.id === corner?.b);
  if (!corner || a?.kind !== "segment" || b?.kind !== "segment") return null;
  try {
    return filletCorner(a, b, corner.aEnd, corner.bEnd);
  } catch {
    return null;
  }
}
