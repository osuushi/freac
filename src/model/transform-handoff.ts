import type { SketchEditor } from "../sketch/editor.js";
import { pick } from "../sketch/picking.js";

/** Finish a scale preview before handing the same press to an arrow or sphere. */
export function installTransformHandoff(
  editor: SketchEditor,
  scaling: () => boolean,
  finish: () => Promise<boolean>,
  signal: AbortSignal,
): void {
  window.addEventListener(
    "pointerdown",
    (event) => {
      if (!scaling() || event.button) return;
      const target = event.target;
      const widget = target instanceof Element && target.closest(".move-anchor, .body-axis-handle");
      const hit =
        target === editor.world.canvas
          ? pick(editor, { x: event.clientX, y: event.clientY })
          : null;
      if (!widget && hit?.kind !== "translate" && hit?.kind !== "rotate") return;
      event.preventDefault();
      event.stopImmediatePropagation();
      let released = false,
        last = { x: event.clientX, y: event.clientY };
      const buffer = new AbortController();
      const track = (next: PointerEvent) => {
        if (next.pointerId !== event.pointerId) return;
        last = { x: next.clientX, y: next.clientY };
        released ||= next.type === "pointerup";
      };
      window.addEventListener("pointermove", track, { signal: buffer.signal, capture: true });
      window.addEventListener("pointerup", track, { signal: buffer.signal, capture: true });
      void finish().then(
        (done) => {
          buffer.abort();
          if (!done || !(target instanceof Element) || !target.isConnected) return;
          const replay = (type: string, position: { x: number; y: number }) =>
            new PointerEvent(type, {
              bubbles: true,
              cancelable: true,
              pointerId: event.pointerId,
              pointerType: event.pointerType,
              button: event.button,
              buttons: type === "pointerup" ? 0 : event.buttons,
              clientX: position.x,
              clientY: position.y,
              metaKey: event.metaKey,
              shiftKey: event.shiftKey,
              altKey: event.altKey,
              ctrlKey: event.ctrlKey,
            });
          if (released && Math.hypot(last.x - event.clientX, last.y - event.clientY) > 3) {
            target.dispatchEvent(replay("pointerdown", { x: event.clientX, y: event.clientY }));
            window.dispatchEvent(replay("pointermove", last));
            window.dispatchEvent(replay("pointerup", last));
            return;
          }
          if (released && target.matches(".move-anchor")) {
            (target as HTMLElement).click();
            return;
          }
          if (released) {
            if (target.matches(".body-axis-handle"))
              target.dispatchEvent(new Event("transform-numeric-tap"));
            return;
          }
          target.dispatchEvent(replay("pointerdown", { x: event.clientX, y: event.clientY }));
        },
        (error: unknown) => {
          buffer.abort();
          editor.message = error instanceof Error ? error.message : "Transform handoff failed";
          editor.refresh();
        },
      );
    },
    { signal, capture: true },
  );
}
