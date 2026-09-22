import type { SketchEditor } from "../sketch/editor.js";
import { idleReason, toolCatalog } from "./catalog.js";

export function sketchTools(editor: SketchEditor): () => void {
  const catalog = toolCatalog(editor);
  const disposers: (() => void)[] = [];
  for (const [id, label, shortcut, aliases] of [
    ["select", "Select", "V", ["pointer"]],
    ["rectangle", "Rectangle", "R", ["box"]],
    ["line", "Line", "L", ["segment"]],
    ["circle", "Circle", "C", ["disk"]],
    ["bezier", "Curve", "B", ["bezier", "cubic curve", "spline"]],
    ["trim", "Trim", "T", ["cut curve"]],
  ] as const)
    disposers.push(
      catalog.register({
        id,
        label,
        shortcut,
        aliases,
        category: id === "select" ? "Select" : "Sketch",
        description: id === "select" ? "Select geometry" : "Draw or edit in a planar workspace",
        reason: () => (editor.interactions.current?.kind === "numeric" ? null : idleReason(editor)),
        run: () => editor.setTool(id),
      }),
    );
  disposers.push(
    catalog.register({
      id: "sketch-move",
      label: "Move sketch geometry",
      category: "Transform",
      shortcut: "M",
      aliases: ["translate sketch", "rotate sketch"],
      reason: () =>
        !editor.world.active || !editor.selectionOwners.size
          ? "Select sketch curves or points"
          : editor.interactions.current?.kind === "numeric"
            ? null
            : idleReason(editor),
      run: () => editor.activateMove(),
    }),
  );
  for (const id of ["undo", "redo"] as const)
    disposers.push(
      catalog.register({
        id,
        label: id === "undo" ? "Undo" : "Redo",
        category: "Document & Edit",
        shortcut: id === "undo" ? "⌘Z" : "⇧⌘Z",
        allowBusy: id === "undo",
        reason: () =>
          (id === "undo" ? editor.store.canUndo : editor.store.canRedo) ? null : `Nothing to ${id}`,
        run: () => editor.history(id),
      }),
    );
  disposers.push(
    catalog.register({
      id: "grid",
      label: "Toggle grid snapping",
      category: "View",
      aliases: ["grid snap"],
      reason: () => idleReason(editor),
      run: () => {
        editor.gridSnap = !editor.gridSnap;
        editor.refresh();
      },
    }),
    catalog.register({
      id: "modeling",
      label: "Return to Modeling",
      category: "View",
      aliases: ["exit sketch", "3d"],
      reason: () => (!editor.world.active ? "Already in Modeling" : idleReason(editor)),
      run: async () => {
        await editor.commitNumeric();
        editor.world.exit();
      },
    }),
    catalog.register({
      id: "clear-sketch",
      label: "Clear sketch",
      category: "Document & Edit",
      reason: () =>
        idleReason(editor) ??
        (!editor.sketch?.curves.length ? "Open a sketch containing curves" : null),
      run: () => editor.clear(),
    }),
  );
  return () => {
    for (const dispose of disposers) dispose();
  };
}
