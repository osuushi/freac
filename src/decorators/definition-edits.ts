import type { SketchDocument } from "../sketch/document.js";
import { type DefinitionEdit, definitionSettings, validateDefinition } from "./definition.js";

export function validateDefinitions(document: SketchDocument): void {
  if (document.decoratorDefinitions === undefined) return;
  if (!Array.isArray(document.decoratorDefinitions) || document.decoratorDefinitions.length > 64)
    throw new Error("Invalid bundled decorator definitions");
  const keys = new Set<string>();
  for (const definition of document.decoratorDefinitions) {
    validateDefinition(definition);
    const key = `${definition.id}/${definition.version}`;
    if (keys.has(key)) throw new Error("Duplicate decorator definition version");
    keys.add(key);
    for (const instance of document.decorators ?? [])
      if (instance.definition === definition.id && instance.version === definition.version)
        definitionSettings(definition, instance.settings);
  }
}

/** Installing/replacing source is one ordinary Undo edit; it does not execute or enable code. */
export function editDefinitions(document: SketchDocument, edit: DefinitionEdit): SketchDocument {
  const previous = document.decoratorDefinitions ?? [];
  const definition = edit.action === "install" ? edit.definition : edit;
  if (edit.action === "install") validateDefinition(edit.definition);
  else if (edit.action !== "remove") throw new Error("Unknown decorator definition edit");
  if (
    edit.action === "remove" &&
    document.decorators?.some(
      (d) => d.definition === definition.id && d.version === definition.version,
    )
  )
    throw new Error("Remove this definition's decorators before removing its code");
  const rest = previous.filter((d) => d.id !== definition.id || d.version !== definition.version);
  const next = {
    ...document,
    decoratorDefinitions: edit.action === "install" ? [...rest, edit.definition] : rest,
  };
  validateDefinitions(next);
  return next;
}
