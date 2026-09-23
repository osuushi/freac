import type { SketchEditor } from "../sketch/editor.js";
import { onModelKeydown } from "../sketch/model-keys.js";
import { idleReason, toolCatalog } from "../tools/catalog.js";
import { toolMenuOpen } from "../tools/menu-focus.js";
import type { DocumentCommand, DocumentHost, DocumentStatus } from "./document-host.js";
import { exportControls } from "./export-controls.js";

export function nativeFileControls(editor: SketchEditor, host: DocumentHost): () => void {
  const title = document.createElement("span");
  title.className = "document-title";
  title.setAttribute("aria-label", "Current document");
  document.querySelector("header")?.append(title);
  const disposeExport = exportControls(editor);
  const status = (value: DocumentStatus) => {
    title.textContent = `${value.name}${value.edited ? " · Edited" : ""}`;
    title.title = value.path ?? "Unsaved document";
    if (value.warning) {
      editor.message = value.warning;
      editor.refresh();
    }
  };
  const run = (command: DocumentCommand) => runDocumentCommand(editor, host, command);
  const abort = new AbortController();
  onModelKeydown(
    (event) => {
      if (!(event.metaKey || event.ctrlKey) || event.altKey) return;
      const key = event.key.toLowerCase();
      const command =
        key === "n"
          ? "new"
          : key === "o"
            ? "open"
            : key === "s"
              ? event.shiftKey
                ? "save-as"
                : "save"
              : key === "w"
                ? "close"
                : null;
      if (!command) return;
      event.preventDefault();
      void toolCatalog(editor).invoke(command);
    },
    { signal: abort.signal },
  );
  const disposers = (["new", "open", "save", "save-as", "close"] as const).map((command) =>
    toolCatalog(editor).register({
      id: command,
      label: {
        new: "New document",
        open: "Open document",
        save: "Save document",
        "save-as": "Save document as…",
        close: "Close document",
      }[command],
      category: "Document & Edit",
      reason: () => idleReason(editor),
      run: () => run(command),
    }),
  );
  const disposeCommands = host.onCommand((command) => {
    void editor.store.settled().then(() => run(command));
  });
  const disposeStatus = host.onStatus(status);
  let initialized = false;
  const update = () => {
    if (!initialized && !editor.store.busy) {
      initialized = true;
      void host.status().then(status);
    }
  };
  editor.world.changed.add(update);
  update();
  return () => {
    abort.abort();
    disposeExport();
    disposeCommands();
    disposeStatus();
    editor.world.changed.delete(update);
    for (const dispose of disposers) dispose();
    title.remove();
  };
}

async function runDocumentCommand(
  editor: SketchEditor,
  host: DocumentHost,
  command: DocumentCommand,
): Promise<void> {
  const leaving = command === "close" || command === "quit" || command === "restart-update";
  if (toolMenuOpen() && !leaving) {
    if (
      (command === "undo" || command === "redo") &&
      document.activeElement instanceof HTMLInputElement
    )
      document.execCommand(command);
    return;
  }
  if (editor.store.scriptRunning && leaving) {
    const result = await host.command(command);
    if (result.error) {
      editor.message = result.error;
      editor.refresh();
    }
    return;
  }
  if (command === "undo" || command === "redo") {
    const focused = document.activeElement;
    if (focused instanceof HTMLElement && focused.closest(".agent-dock")) return;
    if (focused instanceof HTMLInputElement || focused instanceof HTMLTextAreaElement) {
      document.execCommand(command);
    } else await editor.history(command);
    return;
  }
  if (editor.blocked || editor.isDragging) return;
  if (editor.interactions.current) {
    editor.message = "Finish or cancel the current tool before using document commands.";
    editor.refresh();
    return;
  }
  editor.store.busy = true;
  editor.message = command === "open" ? "Opening document…" : "Working with document…";
  editor.refresh();
  try {
    await editor.store.settled();
    const result = await host.command(command);
    if (result.error) throw new Error(result.error);
    if (result.replaced) {
      await editor.store.documentReplaced();
      editor.bodiesVisible = true;
      editor.visibility.hidden.clear();
      editor.selectTargets([]);
      editor.modeling.targets = [];
      editor.world.exit();
      editor.notice = "";
    }
    editor.message = "";
  } catch (error) {
    editor.message = error instanceof Error ? error.message : String(error);
  } finally {
    editor.store.busy = false;
    editor.refresh();
  }
}
