import type { InteractionLease } from "../sketch/active-interaction.js";
import type { SketchEditor } from "../sketch/editor.js";
import { onModelKeydown } from "../sketch/model-keys.js";
import type { Body, BodyBoolean } from "./body.js";
import { bodyCenter } from "./body-placement.js";
import { BooleanOperands } from "./boolean-operands.js";
import { BooleanWidget } from "./boolean-widget.js";

export class BooleanControls {
  private widget: BooleanWidget;
  private outlines: BooleanOperands;
  private abort = new AbortController();
  private lease: InteractionLease | null = null;
  private bodies: Body[] = [];
  private operation: BodyBoolean = { ids: [], mode: "union", keepOriginals: false };
  private running: Promise<void> | null = null;
  private valid = false;
  private count = 0;
  constructor(
    private editor: SketchEditor,
    overlay: HTMLElement,
  ) {
    this.outlines = new BooleanOperands(editor);
    this.widget = new BooleanWidget(
      overlay,
      (mode) =>
        this.change(() => {
          this.operation.mode = mode;
        }),
      () =>
        this.change(() => {
          this.operation.keepOriginals = !this.operation.keepOriginals;
        }),
      () =>
        this.change(() => {
          this.bodies.push(this.bodies.shift() as Body);
        }),
      () => {
        void this.finish();
      },
      () => {
        void this.cancel();
      },
    );
    this.widget.cleanup.onclick = () => void this.finish(true);
    onModelKeydown(
      (event) => {
        if (!this.lease || !["Enter", "Escape"].includes(event.key)) return;
        event.preventDefault();
        event.stopImmediatePropagation();
        if (event.key === "Escape") void this.cancel();
        else void this.finish();
      },
      { signal: this.abort.signal, capture: true },
    );
    editor.world.changed.add(this.update);
  }
  start = (mode: BodyBoolean["mode"]): void => {
    if (this.editor.blocked || this.editor.world.active || this.editor.interactions.current) return;
    const resolution = this.editor.modeling.resolve("boolean");
    if (!resolution.available) return;
    this.bodies = resolution.inputs;
    if (this.bodies.length < 2) return;
    this.lease = this.editor.interactions.acquire(
      "body-boolean",
      () => this.cancel(),
      () => this.finish(),
    );
    if (!this.lease) return;
    this.operation = { ids: [], mode, keepOriginals: false };
    this.editor.modeling.hover = null;
    this.editor.bodiesVisible = true;
    this.change(() => {});
  };
  private change(change: () => void): void {
    if (this.editor.blocked || this.lease?.phase !== "editing") return;
    change();
    this.operation.ids = this.bodies.map((b) => b.id);
    this.outlines.show(this.bodies, this.operation.mode);
    this.valid = false;
    this.lease.show(null);
    this.running = this.preview();
  }
  private async preview(): Promise<void> {
    const success = await this.editor.store.request({
      kind: "boolean-bodies",
      operation: this.operation,
    });
    if (this.lease?.phase !== "editing") return;
    this.valid = success;
    if (success) {
      const candidate = this.editor.store.candidate;
      this.lease.show(candidate);
      const retained =
        this.editor.store.data.bodies?.filter(
          (b) =>
            !this.operation.ids.includes(b.id) ||
            (this.operation.keepOriginals &&
              (this.operation.mode !== "subtract" || b.id !== this.operation.ids[0])),
        ).length ?? 0;
      this.count = (candidate?.bodies?.length ?? 0) - retained;
    }
    this.editor.refresh();
  }
  private async finish(cleanup = false): Promise<boolean> {
    await this.running;
    const lease = this.lease;
    if (!lease || !this.valid || !lease.close()) return false;
    const consumed = this.operation.ids.filter(
      (_, i) => !this.operation.keepOriginals || (this.operation.mode === "subtract" && i === 0),
    );
    const retained = new Set(
      this.editor.store.data.bodies?.filter((b) => !consumed.includes(b.id)).map((b) => b.id),
    );
    const success = await this.editor.accept(cleanup);
    if (!success) {
      if (this.lease) this.lease.phase = "editing";
      this.editor.refresh();
      return false;
    }
    if (success)
      this.editor.modeling.targets =
        this.editor.store.data.bodies
          ?.filter((b) => !retained.has(b.id))
          .map((b) => ({ kind: "body", body: b.id })) ?? [];
    this.end(lease);
    return success;
  }
  private async cancel(): Promise<void> {
    const lease = this.lease;
    if (!lease?.close()) return;
    lease.show(null);
    await this.editor.store.cancelPreview();
    await this.running;
    this.end(lease);
  }
  private end(lease: InteractionLease): void {
    this.lease = null;
    this.widget.root.hidden = true;
    this.outlines.clear();
    lease.release();
    this.editor.refresh();
  }
  private update = (): void => {
    this.widget.cleanup.disabled = !this.valid || this.editor.blocked;
    if (!this.lease) return;
    const target =
      (this.editor.store.data.bodies ?? []).findIndex((b) => b.id === this.bodies[0].id) + 1;
    this.widget.update(
      this.operation,
      `Body ${target}`,
      this.editor.blocked,
      this.valid,
      this.count,
    );
    const p = this.editor.world.project(bodyCenter(this.bodies));
    this.widget.root.style.left = `${Math.max(260, Math.min(innerWidth - 260, p.x))}px`;
    this.widget.root.style.top = `${Math.max(70, Math.min(innerHeight - 75, p.y + 90))}px`;
  };
  dispose(): void {
    this.abort.abort();
    this.editor.world.changed.delete(this.update);
    this.widget.dispose();
    this.outlines.dispose();
  }
}
