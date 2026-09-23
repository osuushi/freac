import type { SketchEditor } from "../sketch/editor.js";
import { type PlaneFrame, planes } from "../sketch/planes.js";
import { PlaneCutHover } from "./plane-cut-hover.js";
import { pickPlaneInterior } from "./plane-interior-pick.js";

/** A tool consumes an evaluated frame; picking never creates a dependency. */
export class PlaneReferencePicker {
  private abort = new AbortController();
  private hover: PlaneCutHover;
  accepts: ((frame: PlaneFrame) => boolean) | undefined;
  private leave: (() => void) | undefined;
  choose: ((frame: PlaneFrame) => void) | null = null;
  constructor(private editor: SketchEditor) {
    this.hover = new PlaneCutHover(editor, () => this.accepts);
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
        if (!this.choose || !this.accepts || event.button || event.metaKey || event.ctrlKey) return;
        event.preventDefault();
        event.stopImmediatePropagation();
        if (editor.blocked) return;
        const hit = pickPlaneInterior(editor, { x: event.clientX, y: event.clientY }, this.accepts);
        if (hit) this.choose(structuredClone(hit.frame));
        else this.leave?.();
      },
      options,
    );
  }
  start(
    choose: (frame: PlaneFrame) => void,
    accepts?: (frame: PlaneFrame) => boolean,
    leave?: () => void,
  ): void {
    this.accepts = accepts ?? (() => true);
    this.leave = leave;
    this.editor.world.planePickerAccept = this.accepts;
    this.choose = (frame) => {
      if (this.accepts && !this.accepts(frame)) return;
      this.hover.clear();
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
    this.hover.clear();
  }
  dispose(): void {
    this.stop();
    this.abort.abort();
    this.hover.dispose();
  }
}
