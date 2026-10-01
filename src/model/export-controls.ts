import type { SketchEditor } from "../sketch/editor.js";
import { idleReason, toolCatalog } from "../tools/catalog.js";
import type { ExportFormat } from "./mesh-export.js";
import { type NativeExportBridge, nativeExportClient } from "./native-export-client.js";

type ExportJob = { worker?: Worker; native?: NativeExportBridge; cancelled?: boolean };

class ExportSession {
  private job: ExportJob | null = null;
  constructor(private editor: SketchEditor) {}
  get visibleBodies() {
    const editor = this.editor;
    return (editor.store.data.bodies ?? []).filter(
      (body) => editor.bodiesVisible && editor.visibility.visible(body.id),
    );
  }
  get busy() {
    return !!this.job;
  }
  cancel(): void {
    if (this.job) void this.finish(this.job);
  }
  private async finish(current: ExportJob, error?: string) {
    if (this.job !== current || current.cancelled) return;
    current.cancelled = true;
    current.worker?.terminate();
    try {
      await current.native?.cancel();
    } catch (cancelError) {
      error ??= cancelError instanceof Error ? cancelError.message : String(cancelError);
    }
    if (this.job !== current) return;
    this.job = null;
    const editor = this.editor;
    if (editor.notice === "Preparing export…" || editor.notice === "Generating export mesh…")
      editor.notice = "";
    if (error) editor.message = error;
    editor.refresh();
  }
  async run(extension: ExportFormat) {
    const editor = this.editor;
    const bodyIds = this.visibleBodies.map((body) => body.id);
    if (editor.blocked || editor.interactions.current || this.job || !bodyIds.length) return;
    const current: ExportJob = {};
    this.job = current;
    editor.notice = "Preparing export…";
    editor.refresh();
    try {
      const sources = editor.store.decoratorSources;
      const snapshot = await editor.store.exportGeometry(bodyIds);
      if (this.job !== current || current.cancelled) return;
      const native = snapshot.decorators?.length ? await nativeExportClient() : undefined;
      if (this.job !== current || current.cancelled) return;
      current.native = native;
      const worker = new Worker(new URL("./export-worker.ts", import.meta.url), { type: "module" });
      current.worker = worker;
      worker.onmessage = (
        event: MessageEvent<{
          bytes?: Uint8Array<ArrayBuffer>;
          error?: string;
          nativeMesh?: ArrayBuffer;
        }>,
      ) => {
        if (this.job !== current || current.cancelled) return;
        if (event.data.nativeMesh) {
          void this.sendNative(current, event.data.nativeMesh);
          return;
        }
        if (event.data.bytes) download(event.data.bytes, extension);
        void this.finish(current, event.data.error);
      };
      worker.onerror = () => {
        void this.finish(current, "Could not export the solid mesh");
      };
      worker.postMessage({ document: snapshot, format: extension, sources, native: !!native });
      editor.notice = "Generating export mesh…";
      editor.refresh();
    } catch (error) {
      void this.finish(current, error instanceof Error ? error.message : String(error));
    }
  }
  private async sendNative(current: ExportJob, input: ArrayBuffer) {
    try {
      if (!current.native) throw new Error("Native export unavailable");
      const output = await current.native.integrate(input);
      if (this.job === current && !current.cancelled)
        current.worker?.postMessage({ nativeResult: output }, [output]);
    } catch (error) {
      if (this.job === current && !current.cancelled)
        current.worker?.postMessage({
          nativeError: error instanceof Error ? error.message : String(error),
        });
    }
  }
}

export function exportControls(editor: SketchEditor): () => void {
  const session = new ExportSession(editor);
  const disposers = (["stl", "3mf"] as const).map((format) =>
    toolCatalog(editor).register({
      id: `export-${format}`,
      label: `Export ${format.toUpperCase()}`,
      category: "Document & Edit",
      description: "Visible accepted bodies in millimeters",
      reason: () =>
        idleReason(editor) ??
        (session.busy
          ? "Exporting…"
          : !session.visibleBodies.length
            ? "Create or show a solid body first"
            : null),
      run: () => session.run(format),
    }),
  );
  disposers.push(
    toolCatalog(editor).register({
      id: "cancel-export",
      label: "Cancel export",
      category: "Document & Edit",
      reason: () => (session.busy ? null : "No export is running"),
      run: () => session.cancel(),
    }),
  );
  return () => {
    session.cancel();
    for (const dispose of disposers) dispose();
  };
}

function download(bytes: Uint8Array<ArrayBuffer>, extension: ExportFormat): void {
  const type = extension === "3mf" ? "model/3mf" : "model/stl";
  const url = URL.createObjectURL(new Blob([bytes], { type }));
  const link = document.createElement("a");
  link.href = url;
  link.download = `Untitled.${extension}`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
