import type { SketchEditor } from "../sketch/editor.js";
import { pickMirrorReference } from "./mirror-reference.js";
import { MirrorReferenceView } from "./mirror-reference-view.js";

/** Observe before plane patches consume pointer events, so old candidates clear. */
export class MirrorHover {
  private view: MirrorReferenceView;
  private abort = new AbortController();
  private shown = false;
  constructor(
    private editor: SketchEditor,
    enabled: () => boolean,
  ) {
    this.view = new MirrorReferenceView(editor, true);
    window.addEventListener(
      "pointermove",
      (event) => {
        if (!enabled() || event.buttons || event.target !== editor.world.canvas) {
          this.clear();
          return;
        }
        const reference = pickMirrorReference(editor, { x: event.clientX, y: event.clientY });
        this.view.show(reference);
        this.shown = !!reference;
        editor.world.canvas.style.cursor = reference ? "crosshair" : "";
        editor.world.requestDraw();
      },
      { capture: true, signal: this.abort.signal },
    );
    window.addEventListener("blur", () => this.clear(), { signal: this.abort.signal });
    editor.world.canvas.addEventListener("pointerleave", () => this.clear(), {
      signal: this.abort.signal,
    });
  }
  clear(): void {
    if (!this.shown) return;
    this.shown = false;
    this.view.show(null);
    this.editor.world.canvas.style.cursor = "";
    this.editor.world.requestDraw();
  }
  dispose(): void {
    this.abort.abort();
    this.clear();
    this.view.dispose();
  }
}
