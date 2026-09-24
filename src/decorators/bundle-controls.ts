import type { SketchEditor } from "../sketch/editor.js";
import type { DecoratorDefinition } from "./definition.js";

export function appendBundleControls(
  root: HTMLElement,
  editor: SketchEditor,
  definition: DecoratorDefinition,
): void {
  const details = document.createElement("details");
  const summary = document.createElement("summary");
  summary.textContent = `Source for ${definition.name}`;
  const source = document.createElement("pre");
  source.textContent = definition.source;
  details.append(summary, source);
  const save = document.createElement("button");
  save.type = "button";
  save.textContent = `Export ${definition.name} bundle`;
  save.onclick = () => {
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(definition, null, 2)], { type: "application/json" }),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = `${definition.id}.json`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  const remove = document.createElement("button");
  remove.type = "button";
  remove.textContent = `Remove ${definition.name} bundle`;
  const used = editor.store.data.decorators?.some(
    (d) => d.definition === definition.id && d.version === definition.version,
  );
  remove.disabled = editor.store.busy || !!used;
  remove.title = used ? "Remove this bundle's decorations first" : "";
  remove.onclick = () => {
    void editor.store.request({
      kind: "decorator-definition",
      edit: { action: "remove", id: definition.id, version: definition.version },
    });
  };
  root.append(details, save, remove);
}
