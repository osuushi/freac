import type { SketchEditor } from "../sketch/editor.js";
import { type ModelingTarget, modelingKey } from "../sketch/model-selection.js";
import type { DecoratorDiagnostic } from "./javascript-hooks.js";
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
      const diagnostics: DecoratorDiagnostic[] = result.diagnostics.length
        ? result.diagnostics
        : result.reason
          ? [{ severity: "error", message: result.reason, faces: undefined }]
          : [];
      for (const diagnostic of diagnostics) {
        const note = document.createElement("p");
        note.className = "decorator-warning";
        note.textContent = diagnostic.message;
        container.append(note);
        if (!diagnostic.faces?.length && !diagnostic.edges?.length) continue;
        const button = document.createElement("button");
        button.type = "button";
        button.textContent = diagnostic.edges?.length
          ? "Show affected geometry"
          : "Show affected faces";
        button.onclick = () => {
          const targets: ModelingTarget[] = [
            ...[...instance.faces, ...(diagnostic.faces ?? [])].map((f) => ({
              kind: "face" as const,
              ...f,
            })),
            ...(diagnostic.edges ?? []).map((e) => ({ kind: "edge" as const, ...e })),
          ];
          editor.modeling.targets = [...new Map(targets.map((t) => [modelingKey(t), t])).values()];
          editor.refresh();
        };
        container.append(button);
      }
    })
    .catch((error) => {
      if (container.isConnected) container.textContent = String(error);
    });
}
