import type { SketchEditor } from "../sketch/editor.js";
import { idleReason, toolCatalog } from "../tools/catalog.js";
import type { ExportFormat } from "./mesh-export.js";

export function exportControls(editor: SketchEditor): () => void {
  let worker: Worker | null = null;
  const blocked = () => editor.blocked || !!editor.interactions.current || !!worker;
  const finish = (error?: string) => {
    worker?.terminate();
    worker = null;
    if (error) {
      editor.message = error;
      editor.refresh();
    }
    editor.refresh();
  };
  const run = (extension: ExportFormat) => {
    if (blocked() || !editor.store.data.bodies?.length) return;
    try {
      worker = new Worker(new URL("./export-worker.ts", import.meta.url), { type: "module" });
      worker.onmessage = (
        event: MessageEvent<{ bytes?: Uint8Array<ArrayBuffer>; error?: string }>,
      ) => {
        if (event.data.bytes) {
          const type = extension === "3mf" ? "model/3mf" : "model/stl";
          const url = URL.createObjectURL(new Blob([event.data.bytes], { type }));
          const link = document.createElement("a");
          link.href = url;
          link.download = `Untitled.${extension}`;
          link.click();
          setTimeout(() => URL.revokeObjectURL(url), 1000);
        }
        finish(event.data.error);
      };
      worker.onerror = () => finish("Could not export the solid mesh");
      worker.postMessage({ bodies: editor.store.data.bodies, format: extension });
      editor.refresh();
    } catch (error) {
      finish(error instanceof Error ? error.message : String(error));
    }
  };
  const disposers = (["stl", "3mf"] as const).map((format) =>
    toolCatalog(editor).register({
      id: `export-${format}`,
      label: `Export ${format.toUpperCase()}`,
      category: "Document & Edit",
      description: "All accepted bodies, including hidden bodies, in millimeters",
      reason: () =>
        idleReason(editor) ??
        (worker
          ? "Exporting…"
          : !editor.store.data.bodies?.length
            ? "Create a solid body first"
            : null),
      run: () => run(format),
    }),
  );
  return () => {
    worker?.terminate();
    for (const dispose of disposers) dispose();
  };
}
