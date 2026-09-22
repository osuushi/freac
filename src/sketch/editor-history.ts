import type { SketchEditor } from "./editor.js";

export async function performHistory(
  editor: SketchEditor,
  direction: "undo" | "redo",
): Promise<void> {
  const interaction = editor.interactions.current;
  if (direction === "undo" && interaction?.finish && !editor.isDragging) {
    const accepted = await interaction.finish();
    if (!accepted) {
      if (editor.interactions.current === interaction) await editor.interactions.cancel();
      return;
    }
    await editor.store.settled();
    await editor.store.request({ kind: "undo" });
    editor.select([]);
    editor.pivot = null;
    editor.overlaps = null;
    editor.activeHandle = undefined;
    editor.refresh();
    return;
  }
  if (editor.blocked || editor.isDragging) return;
  editor.cancelNumeric();
  await editor.interactions.cancel();
  await editor.store.settled();
  await editor.store.request({ kind: direction });
  editor.select([]);
  editor.pivot = null;
  editor.overlaps = null;
  editor.activeHandle = undefined;
  editor.refresh();
}
