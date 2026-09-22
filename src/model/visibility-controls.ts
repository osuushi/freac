import type { SketchEditor } from "../sketch/editor.js";
import { idleReason, toolCatalog } from "../tools/catalog.js";

export function visibilityControls(editor: SketchEditor): () => void {
  const dispose = [true, false].map((visible) =>
    toolCatalog(editor).register({
      id: visible ? "show-bodies" : "hide-bodies",
      label: visible ? "Show bodies" : "Hide bodies",
      category: "View",
      reason: () =>
        idleReason(editor) ??
        (!editor.store.data.bodies?.length
          ? "Create a body first"
          : editor.bodiesVisible === visible
            ? `Bodies are already ${visible ? "shown" : "hidden"}`
            : null),
      run: () => {
        editor.bodiesVisible = visible;
        editor.modeling.targets = [];
        editor.modeling.hover = null;
        editor.refresh();
      },
    }),
  );
  return () => {
    for (const remove of dispose) remove();
  };
}
