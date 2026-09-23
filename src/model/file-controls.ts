import type { SketchEditor } from "../sketch/editor.js";
import { idleReason, toolCatalog } from "../tools/catalog.js";
import { BrowserArchive, downloadArchive } from "./browser-archive.js";
import { documentArchive } from "./document-archive.js";
import { exportControls } from "./export-controls.js";
import { nativeFileControls } from "./native-file-controls.js";
import type { PortableFiles } from "./portable-files.js";

/** Data-only archive: opening never evaluates stored expressions or scripts. */
export function fileControls(editor: SketchEditor, container: HTMLElement): () => void {
  if (window.freacDocument) return nativeFileControls(editor, window.freacDocument);
  let files: PortableFiles = {};
  const codec = new BrowserArchive();
  const input = document.createElement("input");
  input.type = "file";
  input.accept = ".freac,application/json";
  input.hidden = true;
  input.setAttribute("aria-label", "Open Freac file");
  container.append(input);
  const disposeExport = exportControls(editor);
  const blocked = () => editor.blocked || !!editor.interactions.current;
  const save = async () => {
    if (blocked()) return;
    try {
      const data = await codec.run(
        { kind: "write", model: documentArchive(editor.store.data), files },
        editor,
      );
      if (!(data instanceof Uint8Array)) throw new Error("Invalid archive result.");
      downloadArchive(data);
    } catch (error) {
      editor.message = String(error);
      editor.refresh();
    }
  };
  input.onchange = () =>
    void openBrowserFile(editor, input, codec, (loaded) => {
      files = loaded;
    });
  const reason = () => idleReason(editor);
  const catalog = toolCatalog(editor);
  const disposers = [
    catalog.register({
      id: "save",
      label: "Save document",
      category: "Document & Edit",
      reason,
      run: save,
    }),
    catalog.register({
      id: "open",
      label: "Open document",
      category: "Document & Edit",
      reason,
      run: () => input.click(),
    }),
    catalog.register({
      id: "new",
      label: "New document",
      category: "Document & Edit",
      reason,
      run: () => {
        files = {};
        return editor.newDocument();
      },
    }),
  ];
  return () => {
    codec.dispose();
    disposeExport();
    for (const dispose of disposers) dispose();
    input.remove();
  };
}

async function openBrowserFile(
  editor: SketchEditor,
  input: HTMLInputElement,
  codec: BrowserArchive,
  accept: (files: PortableFiles) => void,
): Promise<void> {
  const file = input.files?.[0];
  if (!file || editor.blocked || editor.interactions.current) return;
  editor.store.busy = true;
  editor.message = "Opening document…";
  editor.refresh();
  try {
    if (file.size > 72 * 1024 * 1024) throw new Error("Document is too large.");
    const archive = await codec.run(
      { kind: "read", bytes: new Uint8Array(await file.arrayBuffer()) },
      editor,
    );
    if (archive instanceof Uint8Array) throw new Error("Invalid archive result.");
    if (await editor.store.request({ kind: "open", document: archive.document })) {
      accept(archive.files);
      editor.bodiesVisible = true;
      editor.visibility.hidden.clear();
      editor.world.crossSection = null;
      editor.modeling.targets = [];
      editor.world.exit();
      editor.refresh();
    }
  } catch (error) {
    editor.message = error instanceof Error ? error.message : String(error);
    editor.refresh();
  } finally {
    editor.store.busy = false;
    editor.refresh();
    input.value = "";
  }
}
