import { idleReason, toolCatalog } from "../tools/catalog.js";
import type { SketchEditor } from "./editor.js";
import { planeIds } from "./planes.js";

/** Keyboard/screen-reader plane entry lives in the tool menu, not floating labels. */
export function planeEntryTools(editor: SketchEditor): () => void {
  const disposers = planeIds.map((id) =>
    toolCatalog(editor).register({
      id: `sketch-${id.toLowerCase()}`,
      label: `Sketch on ${id}`,
      category: "Sketch",
      reason: () => idleReason(editor),
      run: () => editor.world.sketchEntry?.(id),
    }),
  );
  return () => {
    for (const dispose of disposers) dispose();
  };
}
