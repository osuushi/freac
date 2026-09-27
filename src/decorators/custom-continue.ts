import type { SketchEditor } from "../sketch/editor.js";
import type { DecoratorInstance, FaceReference } from "./types.js";

export function appendCustomContinue(
  root: HTMLElement,
  editor: SketchEditor,
  instance: DecoratorInstance,
  selected: FaceReference[],
): void {
  const button = document.createElement("button");
  button.type = "button";
  button.textContent = "Continue decorator onto selection";
  button.disabled = true;
  button.dataset.unavailable = "true";
  const note = document.createElement("p");
  note.textContent = "Checking selected geometry…";
  root.append(button, note);
  const faces = [
    ...instance.faces,
    ...selected.filter(
      (f) => !instance.faces.some((old) => old.body === f.body && old.face === f.face),
    ),
  ];
  const snapshot = editor.store.data;
  void editor.store
    .inspectDecorator({
      definition: instance.definition,
      version: instance.version,
      instanceId: instance.id,
      faces,
    })
    .then((result) => {
      if (!button.isConnected || editor.store.data !== snapshot) return;
      const reason =
        result.reason ??
        (result.groups.length === 1
          ? null
          : "These faces cannot continue this decoration. Apply it separately.");
      button.disabled = !!reason || editor.store.busy;
      button.dataset.unavailable = String(!!reason);
      button.title = reason ?? "";
      note.textContent = reason ?? "";
      note.hidden = !reason;
    })
    .catch((error) => {
      if (note.isConnected) note.textContent = String(error);
    });
  button.onclick = async () => {
    if (
      await editor.store.request({
        kind: "decorator",
        edit: { action: "continue", id: instance.id, faces: selected },
      })
    ) {
      const continued = editor.store.data.decorators?.find((d) => d.id === instance.id);
      if (continued) editor.modeling.targets = continued.faces.map((f) => ({ kind: "face", ...f }));
      editor.refresh();
    }
  };
}
