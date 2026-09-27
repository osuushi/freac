import type { SketchEditor } from "../sketch/editor.js";
import { gearFaces } from "./gear-faces.js";
import { resizeGear } from "./gear-resize.js";
import { gearDefinition } from "./gear-settings.js";
import { inspectGear } from "./gear-support.js";
import type { DecoratorInstance } from "./types.js";

export function appendGearInformation(
  root: HTMLElement,
  editor: SketchEditor,
  instances: DecoratorInstance[],
) {
  if (instances[0].definition !== gearDefinition) return;
  const note = document.createElement("p");
  note.textContent = instances
    .map((instance) => {
      const face = gearFaces(editor.store.data, instance.faces)[0];
      if (face.plane) return `Rack · normal module ${instance.settings.module} mm`;
      const dimensions = inspectGear(editor.store.data, instance);
      return `${face.cone ? "Bevel reference" : "Pitch"} Ø${(2 * dimensions.pitchRadius).toPrecision(6)} mm · normal module ${dimensions.normalModule.toPrecision(6)} mm`;
    })
    .join("; ");
  root.append(note);
  const first = instances[0];
  if (instances.length !== 1 || !gearFaces(editor.store.data, first.faces)[0].cylinder) return;
  const button = document.createElement("button");
  button.type = "button";
  button.textContent = "Resize to module";
  button.onclick = () => resizeGear(editor, first);
  root.append(button);
}

/** Mixed selections edit only the members to which a geometric parameter applies. */
export function gearFieldInstances(
  editor: SketchEditor,
  instances: DecoratorInstance[],
  key: string,
) {
  if (instances[0].definition !== gearDefinition) return instances;
  return instances.filter((instance) => {
    const face = gearFaces(editor.store.data, instance.faces)[0];
    if (["module", "direction", "rackPhase"].includes(key)) return !!face.plane;
    if (["teeth", "phase"].includes(key)) return !face.plane;
    if (["helix", "hand"].includes(key)) return !face.cone;
    return true;
  });
}
