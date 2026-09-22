import { appendSelection, copySelection } from "./copy-selection.js";
import type { Sketch } from "./document.js";
import type { Drag } from "./drag-state.js";
import { changedTargets, type EditIntent } from "./edit-intent.js";

export function dragIntent(drag: Drag, candidate: Sketch): EditIntent {
  const before = drag.copying
    ? appendSelection(drag.sketch, copySelection(drag.sketch, drag.ids, drag.copyIds))
    : drag.sketch;
  const targets = changedTargets(before, candidate);
  if (drag.mode === "endpoint" && !Object.keys(drag.quantities).length) {
    // Arc centers are derived when the user drags endpoints. They may move
    // to satisfy constraints rather than becoming accidental pointer targets.
    const endpoints = new Set(targets.filter((p) => p.end !== "center").map((p) => p.curve));
    return {
      kind: "point",
      targets: targets.filter((p) => p.end !== "center" || !endpoints.has(p.curve)),
    };
  }
  if (drag.mode === "move" || drag.mode === "rotate") return { kind: "transform", targets };
  if (["createLine", "createBezier", "createCircle", "createRectangle", "bow"].includes(drag.mode))
    return { kind: "direct" };
  return { kind: "dimension", targets };
}
