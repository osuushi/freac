import type { SketchEditor } from "../sketch/editor.js";
import { onModelKeydown } from "../sketch/model-keys.js";
import type { Extrusion } from "./body.js";

export function extrudeKeys(
  editor: SketchEditor,
  root: HTMLElement,
  actions: {
    active: () => boolean;
    cancel: () => void;
    finish: () => void;
    mode: (mode: Extrusion["mode"]) => void;
  },
  signal: AbortSignal,
): void {
  onModelKeydown(
    (event) => {
      if (!actions.active()) return;
      if (event.target instanceof HTMLSelectElement && event.key !== "Escape") {
        event.stopImmediatePropagation();
        return;
      }
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopImmediatePropagation();
        actions.cancel();
      } else if (event.key === "Enter") {
        event.preventDefault();
        event.stopImmediatePropagation();
        if (event.target instanceof HTMLInputElement && root.contains(event.target)) {
          event.target.blur();
          editor.world.canvas.focus();
        } else actions.finish();
      } else if (!(event.target instanceof HTMLInputElement)) {
        const mode = ({ u: "union", s: "subtract", i: "intersect", n: "new" } as const)[
          event.key.toLowerCase() as "u"
        ];
        if (mode) {
          event.preventDefault();
          event.stopImmediatePropagation();
          actions.mode(mode);
        }
      }
    },
    { signal, capture: true },
  );
}
