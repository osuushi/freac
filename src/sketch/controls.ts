import { fileControls } from "../model/file-controls.js";
import { fixtureControls } from "../model/fixture-controls.js";
import { toolCatalog } from "../tools/catalog.js";
import { sketchTools } from "../tools/sketch-tools.js";
import type { Dimensions } from "./dimensions.js";
import type { SketchEditor } from "./editor.js";
import { onModelKeydown } from "./model-keys.js";
import { focusNumericField } from "./numeric-focus.js";

export function installControls(
  editor: SketchEditor,
  dimensions: Dimensions,
  app: HTMLElement,
): () => void {
  const disposeTools = sketchTools(editor);
  const disposeFiles = fileControls(editor, app);
  const disposeFixtures =
    import.meta.env.DEV || window.freacFixture ? fixtureControls(editor, app) : () => {};
  const abort = installShortcuts(editor, dimensions, app);
  window.addEventListener(
    "blur",
    () => {
      if (editor.interactions.current?.captured) editor.interactions.requestCancel();
    },
    { signal: abort.signal },
  );
  return () => {
    abort.abort();
    disposeTools();
    disposeFiles();
    disposeFixtures();
  };
}
function installShortcuts(
  editor: SketchEditor,
  dimensions: Dimensions,
  app: HTMLElement,
): AbortController {
  const abort = new AbortController();
  onModelKeydown(
    (event) => {
      if (event.key === "Tab" && !event.metaKey && !event.ctrlKey && !event.altKey) {
        if (!event.defaultPrevented && focusNumericField(app, event.shiftKey))
          event.preventDefault();
        return;
      }
      const input =
        event.target instanceof HTMLElement &&
        (event.target instanceof HTMLInputElement ||
          event.target instanceof HTMLTextAreaElement ||
          event.target.isContentEditable);
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "z" && !input) {
        event.preventDefault();
        void toolCatalog(editor).invoke(event.shiftKey ? "redo" : "undo");
        return;
      }
      if (
        !input &&
        !editor.isDragging &&
        (event.metaKey || event.ctrlKey) &&
        event.key.toLowerCase() === "a"
      ) {
        event.preventDefault();
        if (editor.sketch) {
          editor.tool = "select";
          editor.creationArmed = false;
          editor.select(editor.sketch.curves.map((curve) => curve.id));
          editor.refresh();
        }
        return;
      }
      if (input || event.metaKey || event.ctrlKey || event.altKey) return;
      if (event.key === "Escape") {
        event.preventDefault();
        editor.escape();
        return;
      }
      const tool = (
        {
          r: "rectangle",
          b: "bezier",
          l: "line",
          c: "circle",
          t: "trim",
          m: "sketch-move",
          v: "select",
        } as Record<string, string>
      )[event.key.toLowerCase()];
      if (tool && (!event.shiftKey || tool !== "rectangle")) {
        event.preventDefault();
        void toolCatalog(editor).invoke(tool);
        return;
      }
      if (event.key === "Delete" || event.key === "Backspace") {
        event.preventDefault();
        void toolCatalog(editor).invoke("delete");
        return;
      }
      if (/^[0-9.]$/.test(event.key) && !editor.blocked) {
        event.preventDefault();
        dimensions.focusFirst(event.key);
      }
    },
    { signal: abort.signal },
  );
  return abort;
}
