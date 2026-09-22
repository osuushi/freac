import type { SketchEditor } from "../sketch/editor.js";
import type { ModelView } from "../sketch/model-api.js";
import { onModelKeydown } from "../sketch/model-keys.js";

declare global {
  interface Window {
    freacScript?: {
      onState(callback: (state: { running: boolean; view: ModelView }) => void): () => void;
      cancel(): Promise<void>;
    };
  }
}
export function installScriptView(editor: SketchEditor, app: HTMLElement): () => void {
  const api = window.freacScript;
  if (!api) return () => {};
  const root = document.createElement("div");
  root.className = "calculation-progress";
  root.hidden = true;
  root.innerHTML =
    '<span class="calculation-spinner" aria-hidden="true"></span><span>Running agent script…</span><button type="button">Cancel script</button>';
  const button = root.querySelector("button");
  if (!button) throw new Error("Missing script cancel button");
  app.append(root);
  const abort = new AbortController();
  const cancel = () => {
    button.disabled = true;
    void api.cancel().finally(() => {
      button.disabled = false;
    });
  };
  button.addEventListener("pointerdown", (event) => event.preventDefault());
  button.addEventListener("click", cancel);
  onModelKeydown(
    (event) => {
      if (event.key !== "Escape" || !editor.store.scriptRunning) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      cancel();
    },
    { capture: true, signal: abort.signal },
  );
  const dispose = api.onState(({ running, view }) => {
    editor.store.scriptState(running, view);
    root.hidden = !running;
    button.disabled = false;
    editor.refresh();
  });
  return () => {
    dispose();
    abort.abort();
    root.remove();
  };
}
