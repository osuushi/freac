import type { ExportMesh } from "../model/export-mesh.js";
import type { SketchDocument } from "../sketch/document.js";
import type { EnabledDefinition } from "./javascript-hooks.js";
import type { FaceReference } from "./types.js";

interface PreviewRequest {
  document: SketchDocument;
  sources: readonly EnabledDefinition[];
  live: boolean;
  epoch: number;
}

export interface PreviewResponse {
  meshes?: { body: string; faces: FaceReference[]; mesh: ExportMesh }[];
  error?: string;
}

/** A warm worker processes one snapshot at a time and keeps only the latest waiting one. */
export class PreviewQueue {
  private worker: Worker | null = null;
  private active: PreviewRequest | null = null;
  private pending: PreviewRequest | null = null;
  private epoch = 0;
  private mode: boolean | null = null;
  private sourcesKey = "";

  constructor(
    private onResult: (response: PreviewResponse) => void,
    private onError: () => void,
  ) {}

  submit(document: SketchDocument, sources: readonly EnabledDefinition[], live: boolean): void {
    const nextSources = JSON.stringify(sources);
    const sourceChanged = this.sourcesKey !== nextSources;
    if (this.mode !== live || sourceChanged) this.epoch++;
    // A long settled hook must not hold up a newly started live gesture.
    // Disabling or replacing bundled code also stops its previous invocation.
    if (sourceChanged || (live && this.active && !this.active.live)) this.interrupt();
    this.mode = live;
    this.sourcesKey = nextSources;
    this.pending = { document, sources, live, epoch: this.epoch };
    this.pump();
  }

  clear(): void {
    this.epoch++;
    this.pending = null;
    this.mode = null;
    this.interrupt();
  }

  dispose(): void {
    this.clear();
  }

  private interrupt(): void {
    this.worker?.terminate();
    this.worker = null;
    this.active = null;
  }

  private pump(): void {
    if (this.active || !this.pending) return;
    if (!this.worker) {
      this.worker = new Worker(new URL("./preview-worker.ts", import.meta.url), { type: "module" });
      const current = this.worker;
      this.worker.onmessage = (event: MessageEvent<PreviewResponse>) => {
        if (this.worker !== current) return;
        const finished = this.active;
        this.active = null;
        if (finished?.epoch === this.epoch) this.onResult(event.data);
        this.pump();
      };
      this.worker.onerror = () => {
        if (this.worker !== current) return;
        this.worker?.terminate();
        this.worker = null;
        this.active = null;
        this.pending = null;
        this.onError();
      };
    }
    this.active = this.pending;
    this.pending = null;
    this.worker.postMessage({
      document: this.active.document,
      sources: this.active.sources,
      live: this.active.live,
    });
  }
}
