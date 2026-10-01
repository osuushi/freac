import type { SketchEditor } from "../sketch/editor.js";
import { onModelKeydown } from "../sketch/model-keys.js";
import type { ProjectionSource } from "./projection.js";
import { pickProjectionSource } from "./projection-selection.js";

/** Source intent runs ahead of the shared canvas plane picker, including Shift refinement. */
export class ProjectionInput {
  private abort = new AbortController();
  constructor(
    editor: SketchEditor,
    active: () => boolean,
    collecting: () => boolean,
    toggle: (source: ProjectionSource) => void,
    hover: (source: ProjectionSource | null) => void,
    accept: () => void,
    cancel: () => void,
  ) {
    const canvas = editor.world.canvas;
    const options = { signal: this.abort.signal, capture: true };
    const sourceEvent = (event: MouseEvent) => active() && (collecting() || event.shiftKey);
    canvas.addEventListener(
      "pointerdown",
      (event) => {
        if (!active() || event.button || event.metaKey || event.ctrlKey) return;
        event.preventDefault();
        event.stopImmediatePropagation();
      },
      options,
    );
    canvas.ownerDocument.addEventListener(
      "click",
      (event) => {
        if (
          !sourceEvent(event) ||
          event.target !== canvas ||
          event.button ||
          event.metaKey ||
          event.ctrlKey
        )
          return;
        event.preventDefault();
        event.stopImmediatePropagation();
        if (editor.blocked) return;
        const source = pickProjectionSource(editor, { x: event.clientX, y: event.clientY });
        if (source) toggle(source);
      },
      options,
    );
    canvas.ownerDocument.addEventListener(
      "pointermove",
      (event) => {
        if (!active()) return;
        if (event.buttons || event.metaKey || event.ctrlKey) {
          hover(null);
          return;
        }
        if (event.target !== canvas) return;
        if (!sourceEvent(event)) return;
        event.stopImmediatePropagation();
        canvas.style.cursor = "crosshair";
        hover(
          editor.blocked
            ? null
            : pickProjectionSource(editor, { x: event.clientX, y: event.clientY }),
        );
      },
      options,
    );
    canvas.addEventListener(
      "pointerleave",
      () => {
        if (active()) hover(null);
      },
      options,
    );
    canvas.addEventListener(
      "dblclick",
      (event) => {
        if (active()) event.stopImmediatePropagation();
      },
      options,
    );
    this.bindKeys(editor, active, accept, cancel);
    canvas.ownerDocument.addEventListener(
      "keyup",
      (event) => {
        if (active() && event.key === "Shift" && !collecting()) hover(null);
      },
      options,
    );
  }
  private bindKeys(
    editor: SketchEditor,
    active: () => boolean,
    accept: () => void,
    cancel: () => void,
  ): void {
    onModelKeydown(
      (event) => {
        if (!active() || !["Escape", "Enter"].includes(event.key)) return;
        event.preventDefault();
        event.stopImmediatePropagation();
        if (event.key === "Escape") cancel();
        else if (!editor.blocked) accept();
      },
      { signal: this.abort.signal, capture: true },
    );
  }
  dispose(): void {
    this.abort.abort();
  }
}
