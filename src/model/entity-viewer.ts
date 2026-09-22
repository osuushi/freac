import type { SketchEditor } from "../sketch/editor.js";
import { type ModelingTarget, modelingSketch } from "../sketch/model-selection.js";
import { entityRows } from "./entity-presentation.js";
import { renameEntity } from "./entity-rename.js";
import { EntityReorder } from "./entity-reorder.js";

export class EntityViewer {
  readonly referenceRows = document.createElement("section");
  private root = document.createElement("aside");
  private key = "";
  private refreshRows: (() => void)[] = [];
  constructor(
    private editor: SketchEditor,
    app: HTMLElement,
  ) {
    this.root.className = "entity-viewer";
    this.root.setAttribute("aria-label", "Entities");
    app.append(this.root);
    editor.world.changed.add(this.update);
    this.update();
  }
  private async select(target: ModelingTarget, event: MouseEvent): Promise<void> {
    if (this.editor.blocked) return;
    const interaction = this.editor.interactions.current;
    if (interaction && !(await interaction.finish?.())) return;
    if (target.kind === "body" && !this.editor.store.data.bodies?.some((b) => b.id === target.body))
      return;
    this.editor.world.exit();
    this.editor.modeling.choose(target, event.shiftKey, event.metaKey || event.ctrlKey);
    this.editor.modeling.alternatives = [];
    this.editor.refresh();
  }
  private async merge(sourceId: string): Promise<void> {
    if (this.editor.blocked) return;
    const target = modelingSketch(this.editor);
    if (!target || !this.editor.mergeableSketches.some((sketch) => sketch.id === sourceId)) return;
    if (
      !(await this.editor.store.request({
        kind: "merge-sketches",
        targetSketchId: target.id,
        sourceSketchIds: [sourceId],
      }))
    )
      return;
    this.editor.modeling.targets = [{ kind: "sketch", sketch: target.id }];
    this.editor.modeling.alternatives = [];
    this.editor.notice = "Merged sketch";
    this.editor.refresh();
  }
  private row(id: string, name: string, target: ModelingTarget): HTMLElement {
    const row = document.createElement("div");
    row.className = "entity-row";
    const select = document.createElement("button"),
      eye = document.createElement("button");
    select.textContent = name;
    select.setAttribute("aria-label", `Select ${name}`);
    select.onclick = (event) => this.select(target, event);
    select.ondblclick = (event) => {
      if (event.shiftKey || event.metaKey || event.ctrlKey) return;
      renameEntity(this.editor, select, id);
    };
    new EntityReorder(this.editor, row, select, id, target.kind);

    eye.onclick = () => {
      if (this.editor.blocked || this.editor.interactions.current) return;
      const visible = this.editor.visibility.visible(id);
      if (visible) this.editor.visibility.hidden.add(id);
      else this.editor.visibility.hidden.delete(id);
      if (visible && this.editor.world.workspace?.sketchId === id) this.editor.world.exit();
      this.editor.modeling.targets = this.editor.modeling.targets.filter(
        (t) =>
          t.sketch !== id &&
          !((t.kind === "body" || t.kind === "face" || t.kind === "edge") && t.body === id),
      );
      this.editor.modeling.hover = null;
      this.editor.refresh();
    };
    const merge = target.kind === "sketch" ? document.createElement("button") : undefined;
    if (merge) {
      merge.className = "entity-merge";
      merge.textContent = "↔";
      merge.setAttribute("aria-label", `Merge ${name} into selected sketch`);
      merge.title = "Merge into selected sketch";
      merge.onclick = (event) => {
        event.stopPropagation();
        void this.merge(id);
      };
    }
    let shown: boolean | undefined;
    this.refreshRows.push(() => {
      const selected = this.editor.modeling.targets.some((t) =>
        target.kind === "sketch"
          ? t.sketch === id
          : (t.kind === "body" || t.kind === "face" || t.kind === "edge") && t.body === id,
      );
      select.setAttribute(
        "aria-pressed",
        String(selected || this.editor.world.workspace?.sketchId === id),
      );
      const visible = this.editor.visibility.visible(id);
      const mergeable =
        target.kind === "sketch" &&
        this.editor.mergeableSketches.some((sketch) => sketch.id === id);
      if (shown !== visible) {
        shown = visible;
        eye.setAttribute("aria-label", `${visible ? "Hide" : "Show"} ${name}`);
        eye.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/>${visible ? "" : '<path d="m3 3 18 18"/>'}</svg>`;
      }
      eye.disabled = this.editor.blocked || !!this.editor.interactions.current;
      row.classList.toggle("entity-mergeable", mergeable);
      if (merge) {
        merge.hidden = !mergeable;
        merge.disabled = this.editor.blocked || !!this.editor.interactions.current;
      }
      select.disabled =
        this.editor.blocked ||
        (!!this.editor.interactions.current && !this.editor.interactions.current.finish);
      row.classList.toggle("entity-hidden", !visible);
    });
    row.append(select, ...(merge ? [merge] : []), eye);
    return row;
  }
  private update = (): void => {
    const editor = this.editor,
      data = editor.store.data;
    const key = JSON.stringify([
      data.sketches.map((s) => s.id),
      data.bodies?.map((b) => b.id),
      data.entityPresentation,
    ]);
    if (key === this.key) {
      for (const refresh of this.refreshRows) refresh();
      return;
    }
    this.key = key;
    this.root.replaceChildren();
    this.refreshRows = [];
    const title = document.createElement("h2");
    title.textContent = "Entities";
    this.root.append(title);
    for (const [label, rows] of [
      [
        "Bodies",
        entityRows(
          data,
          (data.bodies ?? []).map((b) => b.id),
          "Body",
        ).map((b) => this.row(b.id, b.name, { kind: "body", body: b.id })),
      ],
      [
        "Sketches",
        entityRows(
          data,
          data.sketches.map((s) => s.id),
          "Sketch",
        ).map((s) => this.row(s.id, s.name, { kind: "sketch", sketch: s.id })),
      ],
    ] as const) {
      const heading = document.createElement("h3");
      heading.textContent = `${label} (${rows.length})`;
      this.root.append(heading, ...rows);
    }
    for (const refresh of this.refreshRows) refresh();
    this.root.append(this.referenceRows);
  };
  dispose(): void {
    this.editor.world.changed.delete(this.update);
    this.root.remove();
  }
}
