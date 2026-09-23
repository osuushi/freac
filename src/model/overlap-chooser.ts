import type { InteractionLease } from "../sketch/active-interaction.js";
import type { SketchEditor } from "../sketch/editor.js";
import type { ConstructionPlane } from "./construction-plane.js";
import { type OverlapCandidate, overlapCandidates } from "./overlap-candidates.js";
import { OverlapHighlight } from "./overlap-highlight.js";
import { overlapPreviews } from "./overlap-preview.js";

export class OverlapChooser {
  readonly element = document.createElement("div");
  private lease: InteractionLease | null = null;
  private highlight: OverlapHighlight;
  private snapshot = "";
  private document: unknown;
  constructor(
    private editor: SketchEditor,
    private selectPlane: (p: ConstructionPlane) => void,
  ) {
    this.element.className = "selection-overlap";
    this.element.setAttribute("role", "dialog");
    this.element.setAttribute("aria-label", "Choose overlapping geometry");
    this.element.tabIndex = -1;
    this.element.hidden = true;
    document.body.append(this.element);
    this.highlight = new OverlapHighlight(editor);
    editor.world.changed.add(this.update);
  }
  get opened(): boolean {
    return !!this.lease;
  }
  async open(event: PointerEvent): Promise<void> {
    const e = this.editor;
    const candidates = overlapCandidates(e, { x: event.clientX, y: event.clientY });
    if (!candidates.length) return;
    if (e.interactions.current?.kind === "model-selection") await e.interactions.cancel();
    if (e.blocked || e.world.active || e.interactions.current) return;
    this.lease = e.interactions.acquire("selection-choice", () => this.close());
    if (!this.lease) return;
    this.document = e.store.data;
    this.snapshot = this.viewKey();
    e.modeling.hover = null;
    this.populate(candidates, event);
    this.element.hidden = false;
    const bounds = this.element.getBoundingClientRect();
    this.element.style.left = `${Math.max(8, Math.min(event.clientX + 16, innerWidth - bounds.width - 8))}px`;
    this.element.style.top = `${Math.max(8, Math.min(event.clientY + 16, innerHeight - bounds.height - 8))}px`;
    this.element.focus({ preventScroll: true });
    e.refresh();
  }
  private populate(candidates: OverlapCandidate[], event: PointerEvent): void {
    const title = document.createElement("div");
    title.className = "selection-overlap-title";
    title.textContent = "Choose overlapping geometry";
    const close = document.createElement("button");
    close.textContent = "×";
    close.setAttribute("aria-label", "Close geometry chooser");
    close.onclick = () => this.close();
    title.append(close);
    const list = document.createElement("div");
    list.className = "selection-overlap-items";
    const previews = overlapPreviews(this.editor, candidates);
    for (const [index, candidate] of candidates.entries()) {
      const button = document.createElement("button");
      button.dataset.kind = candidate.target.kind;
      button.dataset.key = candidate.key;
      button.dataset.depth = String(candidate.depth);
      button.setAttribute("aria-label", candidate.label);
      const label = document.createElement("span");
      label.textContent = candidate.label;
      button.append(previews[index], label);
      button.onpointerenter = button.onfocus = () => {
        this.element.dataset.highlight = candidate.key;
        this.highlight.show(candidate.target);
      };
      button.onpointerleave = button.onblur = () => {
        delete this.element.dataset.highlight;
        this.highlight.show(null);
      };
      button.onclick = () => this.choose(candidate, event);
      list.append(button);
    }
    this.element.replaceChildren(title, list);
  }
  private choose(candidate: OverlapCandidate, event: PointerEvent): void {
    this.close();
    const target = candidate.target,
      e = this.editor;
    if (target.kind === "plane") {
      if (target.world) e.world.sketchEntry?.(target.world);
      else {
        const plane = e.store.data.constructionPlanes?.find((p) => p.id === target.saved);
        if (plane) this.selectPlane(plane);
      }
    } else {
      e.modeling.choose(target, event.shiftKey, event.metaKey || event.ctrlKey);
      e.modeling.alternatives = [];
      e.refresh();
    }
  }
  private viewKey(): string {
    const e = this.editor,
      c = e.world.camera;
    return `${c.position.toArray()}:${c.quaternion.toArray()}:${e.world.height}:${e.visibility.key}:${e.bodiesVisible}:${e.world.active}`;
  }
  private update = (): void => {
    if (
      this.opened &&
      (this.document !== this.editor.store.data || this.snapshot !== this.viewKey())
    )
      this.close();
  };
  close(): void {
    if (!this.lease) return;
    this.element.hidden = true;
    delete this.element.dataset.highlight;
    this.highlight.show(null);
    const lease = this.lease;
    this.lease = null;
    lease.release();
    this.editor.world.canvas.focus({ preventScroll: true });
  }
  dispose(): void {
    this.close();
    this.editor.world.changed.delete(this.update);
    this.highlight.dispose();
    this.element.remove();
  }
}
