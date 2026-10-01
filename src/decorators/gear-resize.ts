import type { SketchEditor } from "../sketch/editor.js";
import { gearFaces } from "./gear-faces.js";
import { gearRadiusForModule, gearSettings } from "./gear-settings.js";
import type { DecoratorInstance } from "./types.js";

/** Explicit geometry change: one native candidate, with the usual accept/cancel boundary. */
export function resizeGear(editor: SketchEditor, instance: DecoratorInstance): void {
  const face = gearFaces(editor.store.data, instance.faces)[0];
  if (!face.cylinder) return;
  const cylinder = face.cylinder,
    settings = gearSettings(instance.settings);
  const { dialog, input, information, preview, accept, cancel } = resizeControls(
    (2 * cylinder.radius * Math.cos((settings.helix * Math.PI) / 180)) / settings.teeth,
  );
  let pending: Promise<void> | null = null,
    valid = false,
    closed = false;
  const close = async () => {
    if (closed) return;
    closed = true;
    await pending;
    await editor.store.request({ kind: "cancel-preview" });
    dialog.remove();
    lease?.release();
    editor.refresh();
  };
  const commit = async () => {
    if (!valid || pending || closed) return false;
    if (!(await editor.store.request({ kind: "accept" }))) return false;
    closed = true;
    dialog.remove();
    lease?.release();
    editor.refresh();
    return true;
  };
  const lease = editor.interactions.acquire("numeric", close, commit, {
    navigation: "when-released",
  });
  if (!lease) return;
  const update = () => {
    valid = false;
    accept.disabled = true;
    try {
      information.textContent = `Required pitch radius: ${gearRadiusForModule(input.valueAsNumber, settings.teeth, settings.helix).toPrecision(7)} mm`;
    } catch (error) {
      information.textContent = String(error);
    }
  };
  input.oninput = update;
  preview.onclick = () => {
    if (pending) return;
    pending = (async () => {
      input.disabled = preview.disabled = true;
      valid = false;
      try {
        const radius = gearRadiusForModule(input.valueAsNumber, settings.teeth, settings.helix);
        const candidate = await previewRadius(
          editor,
          instance,
          radius,
          cylinder.radius,
          cylinder.outward,
        );
        if (closed) return;
        lease.show(candidate);
        valid = true;
        information.textContent = `Preview pitch radius ${radius.toPrecision(7)} mm. Accept to change the geometry.`;
      } catch (error) {
        information.textContent = error instanceof Error ? error.message : String(error);
      } finally {
        pending = null;
        input.disabled = preview.disabled = false;
        accept.disabled = !valid;
        editor.refresh();
      }
    })();
  };
  accept.onclick = () => {
    void commit();
  };
  cancel.onclick = () => {
    void close();
  };
  dialog.oncancel = (event) => {
    event.preventDefault();
    void close();
  };
  dialog.onkeydown = (event) => {
    event.stopPropagation();
    if (event.key === "Enter") {
      event.preventDefault();
      if (valid) void commit();
      else preview.click();
    }
  };
  document.body.append(dialog);
  dialog.showModal();
  update();
  input.focus();
}

function resizeControls(module: number) {
  const dialog = document.createElement("dialog");
  dialog.className = "gear-resize";
  dialog.setAttribute("aria-label", "Resize gear to module");
  const label = document.createElement("label");
  label.textContent = "Normal module (mm)";
  const input = document.createElement("input");
  input.type = "number";
  input.min = "0.05";
  input.step = "any";
  input.setAttribute("aria-label", "Target normal module");
  input.value = String(module);
  label.append(input);
  const information = document.createElement("p");
  const preview = document.createElement("button"),
    accept = document.createElement("button"),
    cancel = document.createElement("button");
  preview.textContent = "Preview radius";
  accept.textContent = "Accept radius";
  cancel.textContent = "Cancel";
  accept.disabled = true;
  dialog.append(label, information, preview, accept, cancel);
  return { dialog, input, information, preview, accept, cancel };
}

async function previewRadius(
  editor: SketchEditor,
  instance: DecoratorInstance,
  radius: number,
  previous: number,
  outward: number,
) {
  const distance = (radius - previous) * outward;
  if (
    !(await editor.store.request({
      kind: "offset-faces",
      operation: { faces: [...instance.faces], distance },
    }))
  )
    throw new Error("Cannot resize these faces to the requested radius");
  const candidate = editor.store.candidate;
  if (
    !candidate ||
    gearFaces(candidate, instance.faces).some(
      (f) => !f.cylinder || Math.abs(f.cylinder.radius - radius) > 1e-6,
    )
  )
    throw new Error("The requested radius cannot be reached by this face offset");

  return candidate;
}
