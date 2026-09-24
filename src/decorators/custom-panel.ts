import type { SketchEditor } from "../sketch/editor.js";
import { threadDefinition } from "./thread-settings.js";
import type { DecoratorField, DecoratorInstance, Settings } from "./types.js";

function button(root: HTMLElement, label: string, action: () => void) {
  const element = document.createElement("button");
  element.type = "button";
  element.textContent = label;
  element.onclick = action;
  root.append(element);
  return element;
}

function field(
  root: HTMLElement,
  schema: DecoratorField,
  instances: DecoratorInstance[],
  patch: (patch: Settings) => void,
) {
  const values = instances.map((d) => d.settings[schema.key] ?? schema.default);
  const mixed = values.some((v) => v !== values[0]);
  const label = document.createElement("label");
  label.textContent = schema.label + (schema.unit ? ` (${schema.unit})` : "");
  const input =
    schema.type === "enum" ? document.createElement("select") : document.createElement("input");
  input.setAttribute("aria-label", schema.label);
  if (input instanceof HTMLSelectElement) {
    if (mixed) input.add(new Option("Mixed", ""));
    for (const option of schema.options ?? []) input.add(new Option(option.label, option.value));
  } else {
    input.type = "number";
    input.step = "any";
    input.placeholder = mixed ? "Mixed" : "";
    if (schema.min !== undefined) input.min = String(schema.min);
    if (schema.max !== undefined) input.max = String(schema.max);
  }
  const original = mixed ? "" : String(values[0]);
  input.value = original;
  input.onchange = () =>
    patch({ [schema.key]: input instanceof HTMLInputElement ? input.valueAsNumber : input.value });
  input.onkeydown = (event) => {
    event.stopPropagation();
    if (event.key === "Escape") {
      input.value = original;
      input.blur();
    }
    if (event.key === "Enter") input.blur();
  };
  label.append(input);
  root.append(label);
}

export function appendCustomDecorators(
  root: HTMLElement,
  editor: SketchEditor,
  instances: DecoratorInstance[],
) {
  const groups = new Map<string, DecoratorInstance[]>();
  for (const instance of instances) {
    const key = `${instance.definition}/${instance.version}`;
    const group = groups.get(key) ?? [];
    group.push(instance);
    groups.set(key, group);
  }
  for (const group of groups.values()) {
    const first = group[0];
    const definition = editor.store.data.decoratorDefinitions?.find(
      (d) => d.id === first.definition && d.version === first.version,
    );
    const expand = () => {
      editor.modeling.targets = group.flatMap((d) =>
        d.faces.map((f) => ({ kind: "face" as const, ...f })),
      );
      editor.refresh();
    };
    button(root, `${definition?.name ?? first.definition} · ${group.length}`, expand);
    if (first.definition === threadDefinition) continue;
    if (!definition) {
      const note = document.createElement("p");
      note.textContent = "Definition unavailable. Import its bundled code to edit or export.";
      root.append(note);
    } else if (
      !editor.store.decoratorSources.some(
        (s) =>
          s.id === definition.id &&
          s.version === definition.version &&
          s.source === definition.source,
      )
    ) {
      button(root, `Enable ${definition.name} code`, () => {
        void editor.store.request({
          kind: "decorator-enable",
          id: definition.id,
          version: definition.version,
          enabled: true,
        });
      });
    } else if (!group.some((d) => d.problem)) {
      for (const schema of definition.fields) {
        if (
          schema.visibleWhen &&
          !group.some((d) =>
            schema.visibleWhen?.values.includes(d.settings[schema.visibleWhen.key]),
          )
        )
          continue;
        field(root, schema, group, (patch) => {
          expand();
          void editor.store.request({
            kind: "decorator",
            edit: { action: "settings", ids: group.map((d) => d.id), patch },
          });
        });
      }
    }
    button(root, `Remove ${definition?.name ?? first.definition} from selected faces`, () => {
      const selected = new Set(
        editor.modeling.targets.flatMap((t) => (t.kind === "face" ? [t.face] : [])),
      );
      void editor.store.request({
        kind: "decorator",
        edit: {
          action: "remove",
          faces: group.flatMap((d) => d.faces.filter((f) => selected.has(f.face))),
        },
      });
    });
  }
}
