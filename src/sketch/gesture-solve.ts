import type { InteractionLease } from "./active-interaction.js";
import type { Sketch } from "./document.js";
import type { EditIntent } from "./edit-intent.js";
import type { SketchEditor } from "./editor.js";

type GestureTarget = { sketch: Sketch; intent: EditIntent };

// One running calculation and one replaceable target, owned by a single gesture.
export class GestureSolve {
  private latest: GestureTarget | null = null;
  private pending: GestureTarget | null = null;
  private running: Promise<void> | null = null;
  private cancelled = false;
  valid = false;
  constructor(
    private editor: SketchEditor,
    private interaction: InteractionLease,
  ) {}
  update(sketch: Sketch, intent: EditIntent = { kind: "direct" }): void {
    this.latest = this.pending = { sketch, intent };
    this.valid = false;
    if (!this.running) this.running = this.drain();
  }
  invalidate(): void {
    this.latest = this.pending = null;
    this.valid = false;
    this.interaction.show(null);
  }
  private async drain(): Promise<void> {
    while (this.pending && !this.cancelled) {
      const target = this.pending;
      this.pending = null;
      const valid = await this.editor.store.request({ kind: "preview", ...target });
      if (this.cancelled) break;
      // A moving pointer can stay ahead of every network response. Display each
      // completed solve while retaining only the newest target for acceptance.
      if (this.latest) this.interaction.show(valid ? this.editor.store.candidate : null);
      if (this.latest === target) this.valid = valid;
      this.editor.refresh();
    }
    this.running = null;
  }
  async flush(): Promise<boolean> {
    await this.running;
    return !this.cancelled && this.valid;
  }
  async cancel(): Promise<void> {
    this.cancelled = true;
    this.interaction.show(null);
    this.pending = null;
    await this.editor.store.cancelPreview();
    await this.running;
  }
}
