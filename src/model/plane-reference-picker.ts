import type { SketchEditor } from "../sketch/editor.js";
import { type PlaneFrame, planes } from "../sketch/planes.js";
import { pickFace } from "./body-view.js";
import { planeReference } from "./mirror-reference.js";
import { MirrorReferenceView } from "./mirror-reference-view.js";
import { PlaneCutHover } from "./plane-cut-hover.js";
import { pickPlaneInterior } from "./plane-interior-pick.js";

/** A tool consumes an evaluated frame; picking never creates a dependency. */
export class PlaneReferencePicker {
  private abort = new AbortController();
  private hover: MirrorReferenceView;
  private cutHover: PlaneCutHover;
  accepts: ((frame: PlaneFrame) => boolean) | undefined;
  private leave: (() => void) | undefined;
  choose: ((frame: PlaneFrame) => void) | null = null;
  constructor(private editor: SketchEditor) {
    this.hover = new MirrorReferenceView(editor, true);
    this.cutHover = new PlaneCutHover(editor, () => this.accepts);
    const options = { signal: this.abort.signal, capture: true };
    editor.world.canvas.addEventListener(
      "pointerdown",
      (event) => {
        if (!this.choose || event.button || event.metaKey || event.ctrlKey) return;
        event.preventDefault();
        event.stopImmediatePropagation();
      },
      options,
    );
    editor.world.canvas.addEventListener(
      "click",
      (event) => {
        if (!this.choose || event.button || event.metaKey || event.ctrlKey) return;
        event.preventDefault();
        event.stopImmediatePropagation();
        if (editor.blocked) return;
        if (this.accepts) {
          const frame = pickPlaneInterior(
            editor,
            { x: event.clientX, y: event.clientY },
            this.accepts,
          );
          if (frame) this.choose(structuredClone(frame.frame));
          else this.leave?.();
          return;
        }
        const face = this.face(event);
        if (face?.plane) this.choose(structuredClone(face.plane));
        else this.leave?.();
      },
      options,
    );
    editor.world.canvas.addEventListener(
      "pointermove",
      (event) => {
        if (!this.choose || this.accepts || event.buttons) return;
        const face = this.face(event);
        this.hover.show(
          !this.accepts && face?.plane
            ? { ...planeReference(face.plane), vertices: face.vertices }
            : null,
        );
        editor.world.renderer.render(editor.world.scene, editor.world.camera);
        event.stopImmediatePropagation();
      },
      options,
    );
    editor.world.canvas.addEventListener("pointerleave", () => this.hover.show(null), options);
  }
  private face(event: MouseEvent) {
    const hit = pickFace(this.editor, { x: event.clientX, y: event.clientY });
    return (
      hit &&
      this.editor.display.bodies
        ?.find((b) => b.id === hit.body)
        ?.faces.find((f) => f.id === hit.face)
    );
  }
  start(
    choose: (frame: PlaneFrame) => void,
    accepts?: (frame: PlaneFrame) => boolean,
    leave?: () => void,
  ): void {
    this.accepts = accepts;
    this.leave = leave;
    this.editor.world.planePickerAccept = accepts ?? null;
    this.choose = (frame) => {
      if (this.accepts && !this.accepts(frame)) return;
      this.hover.show(null);
      this.cutHover.clear();
      choose(frame);
    };
    this.editor.world.planePickerLabel = "Use plane";
    this.editor.world.planePicker = (id) => this.choose?.(structuredClone(planes[id]));
  }
  stop(): void {
    this.choose = null;
    this.accepts = undefined;
    this.leave = undefined;
    this.editor.world.planePickerAccept = null;
    this.editor.world.planePicker = null;
    this.editor.world.planePickerLabel = "Project onto";
    this.hover.show(null);
    this.cutHover.clear();
  }
  dispose(): void {
    this.stop();
    this.abort.abort();
    this.hover.dispose();
    this.cutHover.dispose();
  }
}
