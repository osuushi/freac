import { samePlane } from "./document.js";
import type { SketchEditor } from "./editor.js";
import { type PlaneId, planes } from "./planes.js";

/** Changing editing context clears curve intent; history also restores placement. */
export function installWorkspaceSync(editor: SketchEditor): void {
  const world = editor.world;
  world.canNavigate = () => !editor.isDragging;
  world.canEnterSketch = () =>
    world.canNavigate() &&
    !editor.blocked &&
    ![
      "projection",
      "mirror",
      "revolve",
      "extrude",
      "body-move",
      "body-boolean",
      "body-edge-finish",
      "face-offset",
      "shell",
    ].includes(editor.interactions.current?.kind ?? "");
  world.sketchEntry = (id: PlaneId) => {
    const frame = planes[id];
    const index = editor.store.data.sketches.findIndex(
      (sketch) => editor.visibility.visible(sketch.id) && samePlane(sketch.plane, frame),
    );
    const sketch = index < 0 ? undefined : editor.store.data.sketches[index];
    world.enterWorkspace({
      key: sketch ? `Sketch ${index + 1}` : id,
      frame: sketch?.plane ?? frame,
      ...(sketch ? { sketchId: sketch.id } : {}),
    });
    editor.modeling.targets = [];
    editor.modeling.alternatives = [];
    editor.refresh();
  };
  let previous: string | null = null;
  editor.world.changed.add(() => {
    const world = editor.world;
    editor.modeling.sync(editor.store.data);
    const key = world.workspace?.sketchId ?? world.active;
    if (previous === key) return;
    previous = key;
    if (!world.workspace) {
      editor.tool = "select";
      editor.creationArmed = false;
      editor.notice = "";
    }
    editor.moveMode = false;
    editor.pivot = null;
    editor.placingPivot = false;
    editor.hover = null;
    editor.overlaps = null;
    editor.selected.replace([]);
    editor.pointMenu = null;
    editor.pointHover = null;
    editor.constraintHover = null;
    editor.activeHandle = undefined;
    editor.snap = null;
    editor.message = "";
  });
}
