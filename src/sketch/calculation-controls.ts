import { calculationLabel } from "./calculation-state.js";
import type { SketchEditor } from "./editor.js";
import { onModelKeydown } from "./model-keys.js";
import "./calculation.css";

/** Status updates touch only this small panel, never rebuild the scene on a timer. */
export function calculationControls(editor: SketchEditor, app: HTMLElement): () => void {
  const root = document.createElement("div");
  root.className = "calculation-progress";
  root.hidden = true;
  root.innerHTML =
    '<span class="calculation-spinner" aria-hidden="true"></span><span class="calculation-label"></span><button type="button">Cancel calculation</button>';
  const label = root.querySelector(".calculation-label");
  const cancel = root.querySelector("button");
  if (!label || !cancel) throw new Error("Missing calculation controls");
  app.append(root);
  let timer: ReturnType<typeof setInterval> | undefined;
  const abort = new AbortController();
  const cancelCalculation = () => {
    if (!editor.store.canCancel) return;
    if (!editor.interactions.requestCancel()) void editor.store.cancelPreview();
  };
  // Cancelling must not blur a numeric field into accepting its pending edit first.
  cancel.addEventListener("pointerdown", (event) => event.preventDefault(), {
    signal: abort.signal,
  });
  cancel.addEventListener("click", cancelCalculation, { signal: abort.signal });
  onModelKeydown(
    (event) => {
      if (event.key !== "Escape" || !editor.store.working) return;
      // Never let an Escape intended for a calculation change the workspace underneath it.
      event.preventDefault();
      event.stopImmediatePropagation();
      cancelCalculation();
    },
    { capture: true, signal: abort.signal },
  );
  const update = () => {
    root.hidden = !editor.store.slow;
    cancel.disabled = !editor.store.canCancel || editor.interactions.current?.phase === "closing";
    const seconds = ((performance.now() - editor.store.started) / 1000).toFixed(1);
    label.textContent = `${calculationLabel(editor.store.calculation)}… ${seconds} s`;
    if (!root.hidden && !timer) timer = setInterval(update, 100);
    if (root.hidden && timer) {
      clearInterval(timer);
      timer = undefined;
    }
  };
  editor.world.changed.add(update);
  return () => {
    clearInterval(timer);
    abort.abort();
    editor.world.changed.delete(update);
    root.remove();
  };
}
