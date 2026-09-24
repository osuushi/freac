import type { SketchEditor } from "../sketch/editor.js";
import type { DecoratorInstance } from "./types.js";

export function appendCustomDiagnostics(
  root: HTMLElement,
  editor: SketchEditor,
  instance: DecoratorInstance,
): void {
  const container = document.createElement("div");
  root.append(container);
  const snapshot = editor.store.data;
  void editor.store
    .inspectDecorator({
      definition: instance.definition,
      version: instance.version,
      faces: [...instance.faces],
      instanceId: instance.id,
    })
    .then((result) => {
      if (!container.isConnected || editor.store.data !== snapshot) return;
      const diagnostics = result.diagnostics.length
        ? result.diagnostics
        : result.reason
          ? [{ severity: "error", message: result.reason, faces: undefined }]
          : [];
      for (const diagnostic of diagnostics) {
        const note = document.createElement("p");
        note.className = "decorator-warning";
        note.textContent = diagnostic.message;
        container.append(note);
        if (!diagnostic.faces?.length) continue;
        const button = document.createElement("button");
        button.type = "button";
        button.textContent = "Show affected faces";
        button.onclick = () => {
          const refs = [...instance.faces, ...(diagnostic.faces ?? [])];
          const unique = new Map(refs.map((f) => [`${f.body}/${f.face}`, f]));
          editor.modeling.targets = [...unique.values()].map((f) => ({ kind: "face", ...f }));
          editor.refresh();
        };
        container.append(button);
      }
    })
    .catch((error) => {
      if (container.isConnected) container.textContent = String(error);
    });
}
