import type { SketchEditor } from "../sketch/editor.js";
import { worldPoint } from "../sketch/planes.js";
import { selectedPointHits } from "../sketch/point-selection.js";
import { pointTarget } from "../sketch/selected-targets.js";
import type { InspectionTarget, InspectionView } from "./inspection-protocol.js";

/** Reads UI-owned selection/camera only; geometry is read from the host's owner. */
export function inspectionView(editor: SketchEditor, render: boolean): InspectionView {
  const world = editor.world;
  if (editor.blocked || editor.candidate || editor.isDragging || editor.interactions.current)
    throw new Error("Finish or cancel the current edit before inspecting accepted geometry.");
  if (world.cameraMoving) throw new Error("Wait for the camera to settle, then inspect again.");
  const sketch = editor.sketch;
  const selection: InspectionTarget[] = world.active
    ? sketch
      ? editor.selected.targets.map((t) => ({ ...t, sketch: sketch.id }))
      : []
    : editor.modeling.targets.map((t) =>
        t.kind === "profile"
          ? { kind: "profile", sketch: t.sketch, profile: t.profile.key }
          : t.kind === "edge"
            ? { kind: "edge", body: t.body, edge: t.edge }
            : { ...t },
      );
  const result: InspectionView = {
    mode: world.active ? "sketch" : "modeling",
    activeSketch: sketch?.id ?? null,
    selection,
    selectedPoints:
      sketch && world.active
        ? selectedPointHits(editor).flatMap((hit) => {
            const target = pointTarget(hit);
            return target
              ? [
                  {
                    target: { ...target, sketch: sketch.id },
                    position: worldPoint(sketch.plane, hit.point),
                  },
                ]
              : [];
          })
        : [],
    hidden: [...editor.visibility.hidden],
    bodiesVisible: editor.bodiesVisible,
    camera: {
      projection: "orthographic",
      position: world.camera.position.toArray(),
      target: world.target.toArray(),
      up: world.camera.up.toArray(),
      height: world.height,
      width: world.camera.right - world.camera.left,
      near: world.camera.near,
      far: world.camera.far,
    },
    clipping: world.activeFrame
      ? {
          kind: "visual",
          plane: world.activeFrame,
          equations: world.renderer.clippingPlanes.map((p) => [...p.normal.toArray(), p.constant]),
        }
      : null,
  };
  if (render) result.image = captureViewport(editor);
  return structuredClone(result);
}

function captureViewport(editor: SketchEditor): NonNullable<InspectionView["image"]> {
  const world = editor.world;
  // Capture directly after rendering because WebGL's drawing buffer is transient.
  // No camera, viewport or selection changes; HTML controls are deliberately excluded.
  world.renderer.render(world.scene, world.camera);
  const canvas = document.createElement("canvas");
  const scale = Math.min(1, 2048 / Math.max(world.canvas.width, world.canvas.height));
  canvas.width = Math.max(1, Math.round(world.canvas.width * scale));
  canvas.height = Math.max(1, Math.round(world.canvas.height * scale));
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Viewport image capture is unavailable.");
  context.drawImage(world.canvas, 0, 0, canvas.width, canvas.height);
  return {
    data: canvas.toDataURL("image/png"),
    width: canvas.width,
    height: canvas.height,
  };
}

export function installInspection(editor: SketchEditor): () => void {
  return (
    window.freacInspection?.onRequest((render, acquireScript) => {
      const view = inspectionView(editor, render);
      if (acquireScript) editor.store.scriptState(true);
      return view;
    }) ?? (() => {})
  );
}
