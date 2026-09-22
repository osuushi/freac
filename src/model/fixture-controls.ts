import type { SketchEditor } from "../sketch/editor.js";
import { toolCatalog } from "../tools/catalog.js";
import { saveFixture } from "./fixture-host.js";

/** Capture accepted and temporary geometry without finishing or cancelling the tool. */
export function fixtureControls(editor: SketchEditor, toolbar: HTMLElement): () => void {
  let capturing = false;
  const result = document.createElement("input");
  result.readOnly = true;
  result.hidden = true;
  result.setAttribute("aria-label", "Captured fixture path");
  result.title = "Copy this path into the conversation";
  result.style.width = "100%";
  const copy = document.createElement("button");
  copy.dataset.fixture = "capture";
  copy.textContent = "Copy fixture path";
  copy.hidden = true;
  copy.onclick = async () => {
    try {
      await navigator.clipboard.writeText(result.value);
    } catch {
      result.focus();
      result.select();
    }
  };
  // Keep a click from accepting the active tool or changing its selection.
  for (const element of [result, copy])
    element.addEventListener("pointerdown", (event) => {
      if (event instanceof PointerEvent && event.button === 0) {
        event.stopPropagation();
        event.preventDefault();
      }
    });
  const capture = async () => {
    if (editor.blocked) return;
    capturing = true;
    const snapshot = {
      document: editor.store.data,
      preview: editor.candidate,
      backendCandidate: editor.store.candidate,
      lastEdit: editor.store.lastEdit,
      measurements: {
        offsetDistance: editor.store.offsetDistance,
        edgeSize: editor.store.edgeSize,
      },
      error: editor.message,
      notice: editor.notice,
      interaction: editor.interactions.current
        ? {
            kind: editor.interactions.current.kind,
            phase: editor.interactions.current.phase,
          }
        : null,
      modelingSelection: editor.modeling.targets,
      sketchSelection: editor.selected.targets,
      activePlane: editor.world.activeFrame,
      tool: editor.tool,
      hiddenEntities: [...editor.visibility.hidden],
      camera: {
        position: editor.world.camera.position.toArray(),
        up: editor.world.camera.up.toArray(),
        target: editor.world.target.toArray(),
        height: editor.world.height,
      },
    };
    try {
      const history = await editor.store.history();
      const saved = await saveFixture({ ...snapshot, history });
      result.value = saved.path;
      result.hidden = copy.hidden = false;
    } catch (error) {
      editor.message = `Fixture capture failed: ${error instanceof Error ? error.message : String(error)}`;
    } finally {
      capturing = false;
      editor.refresh();
    }
  };
  const output = document.createElement("div");
  output.className = "fixture-result";
  output.append(result, copy);
  toolbar.append(output);
  const dispose = toolCatalog(editor).register({
    id: "capture",
    label: "Capture fixture",
    category: "Development",
    description: "Save accepted geometry, previews and diagnostics without changing the model",
    reason: () => (capturing ? "Capturing fixture…" : null),
    run: capture,
  });
  return () => {
    dispose();
    output.remove();
  };
}
