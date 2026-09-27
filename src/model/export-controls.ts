import type { SketchEditor } from "../sketch/editor.js";
import { idleReason, toolCatalog } from "../tools/catalog.js";
import type { ExportFormat } from "./mesh-export.js";

export function exportControls(editor: SketchEditor): () => void {
  let job: { worker?: Worker } | null = null;
  const visibleBodies = () =>
    (editor.store.data.bodies ?? []).filter(
      (body) => editor.bodiesVisible && editor.visibility.visible(body.id),
    );
  const blocked = () => editor.blocked || !!editor.interactions.current || !!job;
  const finish = (error?: string) => {
    job?.worker?.terminate();
    job = null;
    if (editor.notice === "Preparing export…" || editor.notice === "Generating export mesh…")
      editor.notice = "";
    if (error) {
      editor.message = error;
      editor.refresh();
    }
    editor.refresh();
  };
  const run = async (extension: ExportFormat) => {
    const bodyIds = visibleBodies().map((body) => body.id);
    if (blocked() || !bodyIds.length) return;
    const current = {};
    job = current;
    editor.notice = "Preparing export…";
    editor.refresh();
    try {
      const sources = editor.store.decoratorSources;
      const snapshot = await editor.store.exportGeometry(bodyIds);
      if (job !== current) return;
      const worker = new Worker(new URL("./export-worker.ts", import.meta.url), { type: "module" });
      job.worker = worker;
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
      worker.postMessage({ document: snapshot, format: extension, sources });
      editor.notice = "Generating export mesh…";
      editor.refresh();
    } catch (error) {
      if (job === current) finish(error instanceof Error ? error.message : String(error));
    }
  };
  const disposers = (["stl", "3mf"] as const).map((format) =>
    toolCatalog(editor).register({
      id: `export-${format}`,
      label: `Export ${format.toUpperCase()}`,
      category: "Document & Edit",
      description: "Visible accepted bodies in millimeters",
      reason: () =>
        idleReason(editor) ??
        (job ? "Exporting…" : !visibleBodies().length ? "Create or show a solid body first" : null),
      run: () => run(format),
    }),
  );
  disposers.push(
    toolCatalog(editor).register({
      id: "cancel-export",
      label: "Cancel export",
      category: "Document & Edit",
      reason: () => (job ? null : "No export is running"),
      run: () => finish(),
    }),
  );
  return () => {
    finish();
    for (const dispose of disposers) dispose();
  };
}
