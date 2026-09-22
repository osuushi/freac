import type { SketchEditor } from "./editor.js";
import type { SelectionTarget } from "./selected-targets.js";

/** Replace ordered intent and reset controls whose meaning depends on that intent. */
export function replaceSelection(editor: SketchEditor, targets: readonly SelectionTarget[]): void {
  const previousOwners = [...editor.selectionOwners].sort().join();
  editor.selected.replace(targets);
  if ([...editor.selectionOwners].sort().join() !== previousOwners) {
    editor.pivot = null;
    editor.selectionAngle = 0;
    editor.activeHandle = undefined;
  }
  editor.moveMode = false;
  editor.pointHover = null;
  editor.constraintHover = null;
  editor.pointMenu = null;
  editor.bowSide = null;
  editor.transformAxis = null;
  editor.transformDistance = 0;
}
