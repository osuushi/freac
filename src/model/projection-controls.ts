import * as THREE from "three";
import type { InteractionLease } from "../sketch/active-interaction.js";
import type { Sketch } from "../sketch/document.js";
import type { SketchEditor } from "../sketch/editor.js";
import { onModelKeydown } from "../sketch/model-keys.js";
import type { PlaneFrame } from "../sketch/planes.js";
import { idleReason, toolCatalog } from "../tools/catalog.js";
import type { PlaneReferencePicker } from "./plane-reference-picker.js";
import type { ProjectionSource } from "./projection.js";
import {
  pickProjectionSource,
  projectionKey,
  projectionLines,
  projectionSelection,
} from "./projection-selection.js";

export class ProjectionControls {
  private disposeTool: () => void;
  private root = document.createElement("div");
  private abort = new AbortController();
  private lease: InteractionLease | null = null;
  private sources: ProjectionSource[] = [];
  private previousSelection: SketchEditor["selected"]["targets"] = [];
  private previousModels: SketchEditor["modeling"]["targets"] = [];
  private target: { frame: PlaneFrame; sketchId?: string } | null = null;
  private result: Sketch | null = null;
  private outlines = new THREE.Group();
  private material = new THREE.LineBasicMaterial({ color: "#d28b22", depthTest: false });
  private highlightKey = "";
  constructor(
    private editor: SketchEditor,
    overlay: HTMLElement,
    private picker: PlaneReferencePicker,
  ) {
    this.disposeTool = toolCatalog(editor).register({
      id: "project",
      label: "Project",
      category: "Reference",
      aliases: ["projection"],
      description: "Project faces, edges or curves onto a plane",
      reason: () => idleReason(editor),
      run: () => this.begin(),
    });
    this.root.className = "model-actions projection-actions";
    this.root.innerHTML =
      '<button data-project="accept" aria-label="Accept projection" title="Accept projection (Enter)">✓</button><button data-project="cancel" aria-label="Cancel projection" title="Cancel projection (Escape)">×</button>';
    overlay.append(this.root);
    editor.world.scene.add(this.outlines);
    this.root.onclick = (event) => {
      const action = (event.target as HTMLElement).closest("button")?.dataset.project;
      if (editor.blocked && action !== "cancel") return;
      if (action === "accept") void this.accept();
      else if (action === "cancel") void this.cancel();
    };
    this.bindEvents();
    editor.world.changed.add(this.update);
    this.update();
  }
  private bindEvents(): void {
    const editor = this.editor;
    const options = { signal: this.abort.signal, capture: true };
    editor.world.canvas.addEventListener(
      "pointerdown",
      (event) => {
        if (!this.lease || event.button !== 0 || event.metaKey || event.ctrlKey) return;
        event.preventDefault();
        event.stopImmediatePropagation();
      },
      options,
    );
    // Run before the shared canvas plane picker so Shift-click can refine sources.
    editor.world.canvas.ownerDocument.addEventListener("click", this.pick, options);
    editor.world.canvas.addEventListener(
      "dblclick",
      (event) => {
        if (this.lease) event.stopImmediatePropagation();
      },
      options,
    );
    editor.world.canvas.addEventListener(
      "pointermove",
      (event) => {
        if (!this.lease || event.buttons || event.metaKey || event.ctrlKey) return;
        event.stopImmediatePropagation();
        editor.world.canvas.style.cursor = "crosshair";
      },
      options,
    );
    onModelKeydown((event) => {
      if (!this.lease) return;
      if (event.key === "Escape" || event.key === "Enter") {
        event.preventDefault();
        event.stopImmediatePropagation();
        if (event.key === "Escape") void this.cancel();
        else if (!editor.blocked) void this.accept();
      }
    }, options);
  }
  private async begin(): Promise<void> {
    const e = this.editor;
    if (e.blocked || e.interactions.current) return;
    this.sources = projectionSelection(e);
    this.previousSelection = e.selected.targets;
    this.previousModels = e.modeling.targets;
    await e.numeric.commit();
    this.lease = e.interactions.acquire("projection", () => this.cancel(), undefined, {
      navigation: "when-released",
    });
    if (!this.lease) return;
    this.target = e.world.activeFrame
      ? { frame: e.world.activeFrame, sketchId: e.sketch?.id ?? e.world.workspace?.sketchId }
      : null;
    e.message = "";
    this.configurePicker();
    e.select([]);
    e.modeling.targets = [];
    await this.preview();
    e.refresh();
  }
  private configurePicker(): void {
    if (this.editor.world.active || !this.sources.length) {
      this.picker.stop();
      return;
    }
    this.picker.start(
      (frame) => {
        if (this.editor.blocked || this.lease?.phase !== "editing") return;
        this.target = { frame };
        this.editor.message = "";
        void this.preview();
      },
      undefined,
      () => {
        this.editor.message = "Click a coordinate plane, construction plane or planar face";
        this.editor.refresh();
      },
    );
  }
  private pick = (event: MouseEvent): void => {
    const e = this.editor;
    if (
      !this.lease ||
      event.target !== e.world.canvas ||
      event.button !== 0 ||
      event.metaKey ||
      event.ctrlKey ||
      (!e.world.active && this.sources.length && !event.shiftKey)
    )
      return;
    event.preventDefault();
    event.stopImmediatePropagation();
    if (e.blocked) return;
    const p = { x: event.clientX, y: event.clientY };
    const source = pickProjectionSource(e, p);
    if (!source) return;
    const key = projectionKey(source);
    this.sources = this.sources.some((s) => projectionKey(s) === key)
      ? this.sources.filter((s) => projectionKey(s) !== key)
      : [...this.sources, source];
    e.message = "";
    this.configurePicker();
    void this.preview();
  };
  private async preview(): Promise<void> {
    const e = this.editor,
      lease = this.lease;
    this.result = null;
    lease?.show(null);
    if (!lease) return;
    if (!this.target || !this.sources.length) {
      if (e.store.candidate) await e.store.request({ kind: "discard" });
      e.refresh();
      return;
    }
    const ok = await e.store.request({
      kind: "project",
      projection: { ...this.target, sources: this.sources },
    });
    if (this.lease !== lease || lease.phase !== "editing") return;
    if (ok) {
      const candidate = e.store.candidate;
      this.result =
        candidate?.sketches.find(
          (s) =>
            !e.store.data.sketches.includes(s) &&
            JSON.stringify(s) !==
              JSON.stringify(e.store.data.sketches.find((old) => old.id === s.id)),
        ) ?? null;
      lease.show(candidate);
    }
    e.refresh();
  }
  private async accept(): Promise<void> {
    const e = this.editor,
      result = this.result,
      lease = this.lease;
    if (!result || !lease || e.blocked || !lease.close()) return;
    const old = new Set(
      e.store.data.sketches.find((s) => s.id === result.id)?.curves.map((c) => c.id),
    );
    const ok = await e.accept();
    this.finish();
    if (ok) {
      e.workspaceEntry.enter({ key: "Projected sketch", frame: result.plane, sketchId: result.id });
      e.select(result.curves.filter((c) => !old.has(c.id)).map((c) => c.id));
      e.tool = "select";
      e.notice = "Projected independent curves · cubic approximation within 0.001 mm where needed";
      e.refresh();
    }
  }
  private async cancel(): Promise<void> {
    const lease = this.lease;
    if (!lease?.close()) return;
    await this.editor.store.cancelPreview();
    this.editor.selectTargets(this.previousSelection);
    this.editor.modeling.targets = this.previousModels;
    this.editor.message = "";
    this.finish();
  }
  private finish(): void {
    const lease = this.lease;
    this.lease = null;
    this.sources = [];
    this.result = null;
    this.target = null;
    this.picker.stop();
    this.editor.notice = "";
    this.editor.modeling.hover = null;
    lease?.release();
  }
  private update = (): void => {
    const e = this.editor;
    this.root.hidden = !this.lease;
    for (const b of this.root.querySelectorAll<HTMLButtonElement>("button")) {
      b.disabled =
        (e.blocked && b.dataset.project !== "cancel") ||
        (b.dataset.project === "accept" && !this.result);
    }
    if (this.lease)
      e.notice = this.result
        ? e.world.active
          ? "Enter accepts · Click geometry to change sources · Escape cancels"
          : "Enter accepts · Escape cancels · Shift-click changes sources"
        : e.world.active || !this.sources.length
          ? "Click geometry to project · Escape cancels"
          : "Click a plane to project onto · Shift-click changes sources · Escape cancels";
    const key = JSON.stringify(this.sources);
    if (key === this.highlightKey) return;
    this.highlightKey = key;
    for (const child of this.outlines.children) (child as THREE.Line).geometry.dispose();
    this.outlines.clear();
    for (const points of projectionLines(e, this.sources)) {
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute("position", new THREE.Float32BufferAttribute(points, 3));
      const line = new THREE.Line(geometry, this.material);
      line.renderOrder = 16;
      this.outlines.add(line);
    }
  };
  dispose(): void {
    void this.cancel();
    this.abort.abort();
    this.editor.world.changed.delete(this.update);
    this.root.remove();
    this.disposeTool();
    for (const child of this.outlines.children) (child as THREE.Line).geometry.dispose();
    this.material.dispose();
    this.editor.world.scene.remove(this.outlines);
  }
}
