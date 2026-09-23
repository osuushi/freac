import type { SectionControls } from "../model/section-controls.js";
import type { SketchEditor } from "./editor.js";
import { inspectPlaneTargets } from "./plane-target-inspection.js";
import { selectionFrame } from "./selection-frame.js";

export function installViewInspection(editor: SketchEditor, sections: SectionControls): void {
  const world = editor.world;
  // Read-only inspection of accepted geometry and its projection; no hidden edit path.
  Object.defineProperty(window, "freacInspect", {
    value: () => {
      const frame = selectionFrame(editor),
        sketch = editor.sketch;
      return structuredClone({
        document: editor.store.data,
        busy: editor.blocked,
        solving: editor.store.working,
        solver: editor.store.statistics,
        preview: editor.candidate,
        interaction: editor.interactions.current
          ? { kind: editor.interactions.current.kind, phase: editor.interactions.current.phase }
          : null,
        activePlane: world.active,
        crossSection: world.crossSection,
        sectionSurfaces: sections.surfaceCount,
        sectionCalculating: sections.calculating,
        clipping: world.renderer.clippingPlanes.map((p) => [...p.normal.toArray(), p.constant]),
        planeTargets: inspectPlaneTargets(world),
        activeSketch: editor.sketch?.id ?? null,
        modelingSelection: editor.modeling.targets.map((t) =>
          t.kind !== "profile"
            ? t
            : {
                kind: t.kind,
                sketch: t.sketch,
                key: t.profile.key,
                area: t.profile.area,
                holes: t.profile.holes.length,
              },
        ),
        modelingTool: editor.modeling.tool,
        modelingHover: editor.modeling.hover?.kind ?? null,
        camera: {
          position: world.camera.position.toArray(),
          up: world.camera.up.toArray(),
          target: world.target.toArray(),
          height: world.height,
          moving: world.cameraMoving,
          orbitActive: world.orbit.active,
        },
        selection: [...editor.selectionOwners],
        selectionTargets: editor.selected.targets,
        moveMode: editor.moveMode,
        tool: editor.tool,
        selectedCurves: [...editor.selectedCurves],
        selectedPoint: editor.selectedPoint,
        pointChoice: editor.pointChoice ? [...editor.pointChoice] : null,
        hover: editor.hover,
        snap: editor.snap,
        gridSnap: editor.gridSnap,
        pivot: editor.pivot,
        rotationHandle: sketch && frame ? world.projectLocal(sketch.plane, frame.handle) : null,
        projection: world.activeFrame
          ? {
              origin: world.projectLocal(world.activeFrame, { x: 0, y: 0 }),
              u: world.projectLocal(world.activeFrame, { x: 1, y: 0 }),
              v: world.projectLocal(world.activeFrame, { x: 0, y: 1 }),
            }
          : null,
      });
    },
  });
  Object.defineProperty(window, "freacHistory", { value: () => editor.store.history() });
}
