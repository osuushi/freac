import { ExtrudeControls } from "../model/extrude-controls.js";
import { ModelSelectionDrag } from "../model/model-selection-drag.js";
import { RevolveControls } from "../model/revolve-controls.js";
import { idleReason, toolCatalog } from "../tools/catalog.js";
import type { CameraFraming } from "./camera-motion.js";
import { boundaryPoints } from "./curve-spans.js";
import { newId, type Sketch } from "./document.js";
import type { SketchEditor } from "./editor.js";
import { modelDoubleClick } from "./model-double-click.js";
import { onModelKeydown } from "./model-keys.js";
import { modelingSketch, pickModel, pickModels } from "./model-selection.js";
import { PlacementControls } from "./placement-controls.js";
import { worldPoint } from "./planes.js";
import type { Profile } from "./profiles.js";

export class ModelControls {
  private disposers: (() => void)[] = [];
  private abort = new AbortController();
  private placement: PlacementControls;
  private revolve: RevolveControls;
  private extrusion: ExtrudeControls;
  private selectionDrag: ModelSelectionDrag;
  constructor(
    private editor: SketchEditor,
    overlay: HTMLElement,
  ) {
    this.registerTools();
    this.placement = new PlacementControls(editor, overlay);
    this.revolve = new RevolveControls(editor, overlay);
    this.extrusion = new ExtrudeControls(editor, overlay);
    this.selectionDrag = new ModelSelectionDrag(
      editor,
      overlay,
      () => !this.extrusion.active && !editor.interactions.current,
    );
    const options = { signal: this.abort.signal },
      canvas = editor.world.canvas;
    this.bindCanvas(canvas, options);
    modelDoubleClick(editor, overlay, this.abort.signal, (event) => this.doubleClick(event));
    this.installKeys(options);
  }
  private registerTools(): void {
    const editor = this.editor,
      catalog = toolCatalog(editor);
    const base = () =>
      idleReason(editor) ?? (editor.world.active ? "Return to Modeling first" : null);
    const sketch = () =>
      base() ?? (modelingSketch(editor) ? null : "Select a sketch or its filled region");
    this.disposers.push(
      catalog.register({
        id: "move-sketch",
        label: "Move sketch",
        category: "Transform",
        aliases: ["place sketch", "rotate sketch plane"],
        shortcut: "M",
        reason: sketch,
        run: () => this.move(),
      }),
      catalog.register({
        id: "edit-sketch",
        label: "Edit sketch",
        category: "Sketch",
        aliases: ["open sketch"],
        reason: sketch,
        run: () => this.enter(),
      }),
      catalog.register({
        id: "new-sketch-on-plane",
        label: "New sketch on this plane",
        category: "Sketch",
        aliases: ["new sketch", "same plane"],
        reason: sketch,
        run: () => this.enter(true),
      }),
      catalog.register({
        id: "sketch-on-face",
        label: "Sketch on face",
        category: "Sketch",
        shortcut: "Enter",
        reason: () => {
          const target = editor.modeling.targets.length === 1 ? editor.modeling.targets[0] : null;
          const face =
            target?.kind === "face"
              ? editor.display.bodies
                  ?.find((b) => b.id === target.body)
                  ?.faces.find((f) => f.id === target.face)
              : undefined;
          return base() ?? (face?.plane ? null : "Select one planar solid face");
        },
        run: () => this.enter(),
      }),
      catalog.register({
        id: "select-face",
        label: "Select face",
        category: "Select",
        description: "Choose the solid face underneath the selected sketch region",
        reason: () =>
          base() ??
          (modelingSketch(editor) && editor.modeling.alternatives.some((t) => t.kind === "face")
            ? null
            : "Select a sketch region overlapping a solid face"),
        run: () => {
          const face = editor.modeling.alternatives.find((t) => t.kind === "face");
          if (!face) return;
          editor.modeling.choose(face, false, false);
          editor.modeling.alternatives = [];
          editor.refresh();
        },
      }),
    );
  }
  private bindCanvas(canvas: HTMLCanvasElement, options: AddEventListenerOptions): void {
    const editor = this.editor;
    canvas.addEventListener(
      "pointermove",
      (event) => {
        if (
          editor.world.active ||
          editor.isDragging ||
          editor.blocked ||
          this.extrusion.active ||
          ["revolve", "body-move", "body-boolean", "body-edge-finish", "face-offset"].includes(
            editor.interactions.current?.kind ?? "",
          )
        )
          return;
        editor.modeling.hover = pickModel(editor, { x: event.clientX, y: event.clientY });
        editor.refresh();
      },
      options,
    );
    canvas.addEventListener(
      "click",
      async (event) => {
        if (
          editor.world.active ||
          editor.isDragging ||
          editor.blocked ||
          editor.interactions.current?.kind === "body-move"
        )
          return;
        const interaction = editor.interactions.current;
        if (interaction?.finish && !(await interaction.finish())) return;
        if (this.extrusion.active && !(await this.extrusion.finish())) return;
        const hits = pickModels(editor, { x: event.clientX, y: event.clientY });
        editor.modeling.alternatives = hits.slice(1);
        editor.modeling.choose(hits[0] ?? null, event.shiftKey, event.metaKey || event.ctrlKey);
        this.placement.enabled = false;
        editor.refresh();
      },
      options,
    );
  }
  private doubleClick(event: MouseEvent): void {
    if (event.shiftKey || event.metaKey || event.ctrlKey) return;
    const editor = this.editor;
    if (editor.world.active || editor.blocked || editor.isDragging || editor.interactions.current)
      return;
    const target = pickModel(editor, { x: event.clientX, y: event.clientY });
    if (target?.kind === "face" || target?.kind === "edge" || target?.kind === "body") {
      editor.modeling.choose({ kind: "body", body: target.body }, false, false);
      editor.modeling.alternatives = [];
      this.placement.enabled = false;
      editor.refresh();
    } else if (target) this.enter();
  }
  private installKeys(options: { signal: AbortSignal }): void {
    const editor = this.editor;
    onModelKeydown((event) => {
      if (
        editor.world.active ||
        event.target instanceof HTMLInputElement ||
        editor.blocked ||
        editor.isDragging
      )
        return;
      if (event.key.toLowerCase() === "m" && modelingSketch(editor)) {
        event.preventDefault();
        event.stopImmediatePropagation();
        void toolCatalog(editor).invoke("move-sketch");
        return;
      }
      if (
        event.key === "Enter" &&
        !event.defaultPrevented &&
        !editor.interactions.current &&
        editor.modeling.targets.length === 1 &&
        ["face", "sketch"].includes(editor.modeling.targets[0]?.kind ?? "") &&
        (!(event.target instanceof HTMLButtonElement) ||
          event.target.classList.contains("entity-label")) &&
        !(event.target instanceof HTMLSelectElement) &&
        !(event.target instanceof HTMLTextAreaElement)
      ) {
        event.preventDefault();
        this.enter();
      }
      if (event.key === "Escape") {
        // An operation owns its own cancellation and keeps its selection. This
        // listener otherwise runs before the shared Escape shortcut below.
        if (editor.interactions.current) {
          event.preventDefault();
          event.stopImmediatePropagation();
          editor.interactions.requestCancel();
          return;
        }
        this.placement.enabled = false;
        editor.modeling.targets = [];
        editor.refresh();
      }
    }, options);
  }
  activateRevolve(): void {
    this.revolve.begin();
  }
  private move(): void {
    const sketch = modelingSketch(this.editor);
    if (!sketch) return;
    this.editor.modeling.targets = [{ kind: "sketch", sketch: sketch.id }];
    this.placement.enabled = true;
    this.editor.refresh();
  }
  private enter(fresh = false): void {
    const sketch = modelingSketch(this.editor);
    if (
      this.editor.blocked ||
      this.editor.isDragging ||
      this.extrusion.active ||
      ["revolve", "body-move", "body-boolean", "body-edge-finish", "face-offset"].includes(
        this.editor.interactions.current?.kind ?? "",
      )
    )
      return;
    const target = this.editor.modeling.targets[0];
    if (!sketch && target?.kind === "face") {
      const face = this.editor.display.bodies
        ?.flatMap((b) => b.faces)
        .find((f) => f.id === target.face);
      if (!face?.plane) return;
      this.editor.world.enterWorkspace({
        key: "Face sketch",
        frame: face.plane,
        sketchId: newId(),
      });
      this.editor.modeling.targets = [];
      this.editor.refresh();
      return;
    }
    if (!sketch) return;
    const id = fresh ? newId() : sketch.id;
    if (!fresh) this.editor.visibility.hidden.delete(sketch.id);
    this.editor.world.enterWorkspace(
      {
        key: fresh
          ? "New sketch"
          : (this.editor.display.entityPresentation?.find((entry) => entry.id === sketch.id)
              ?.name ?? `Sketch ${this.editor.display.sketches.indexOf(sketch) + 1}`),
        frame: sketch.plane,
        sketchId: id,
      },
      !fresh && target?.kind === "profile"
        ? profileFraming(this.editor, sketch, target.profile)
        : undefined,
    );
    this.editor.modeling.targets = [];
    this.placement.enabled = false;
    this.editor.refresh();
  }
  dispose(): void {
    for (const dispose of this.disposers) dispose();
    this.abort.abort();
    this.placement.dispose();
    this.extrusion.dispose();
    this.selectionDrag.dispose();
    this.revolve.dispose();
  }
}

function profileFraming(editor: SketchEditor, sketch: Sketch, profile: Profile): CameraFraming {
  const world = editor.world,
    unitsPerPixel = world.height / Math.max(1, world.canvas.clientHeight),
    points = boundaryPoints(profile.outer, unitsPerPixel),
    lowX = Math.min(...points.map((point) => point.x)),
    highX = Math.max(...points.map((point) => point.x)),
    lowY = Math.min(...points.map((point) => point.y)),
    highY = Math.max(...points.map((point) => point.y)),
    center = { x: (lowX + highX) / 2, y: (lowY + highY) / 2 },
    aspect = world.canvas.clientWidth / Math.max(1, world.canvas.clientHeight),
    fittedHeight = Math.max(highY - lowY, (highX - lowX) / Math.max(aspect, 1e-6)) * 1.5;
  return {
    target: worldPoint(sketch.plane, center),
    height: Math.max(0.5, Math.min(10000, fittedHeight)),
  };
}
