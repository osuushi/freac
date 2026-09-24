import * as THREE from "three";
import { boundaryPoints, type CurveSpan } from "./curve-spans.js";
import type { SketchDocument } from "./document.js";
import type { SketchEditor } from "./editor.js";
import { type PlaneFrame, worldPoint } from "./planes.js";
import { closedBoundaries } from "./regions.js";
import { stableClipping } from "./stable-clipping.js";

/** A stencil union keeps overlapping/nested closed cells at one translucent tint. */
export function drawRegionFills(editor: SketchEditor): () => void {
  const material = new THREE.MeshBasicMaterial({
    color: "#5297cd",
    transparent: true,
    opacity: 0.18,
    side: THREE.DoubleSide,
    depthTest: true,
    depthWrite: false,
    stencilWrite: true,
    stencilRef: 1,
    stencilWriteMask: 1,
    stencilFuncMask: 1,
    stencilFunc: THREE.NotEqualStencilFunc,
    stencilZPass: THREE.ReplaceStencilOp,
  });
  stableClipping(material);
  const mesh = new THREE.Mesh(new THREE.BufferGeometry(), material);
  mesh.renderOrder = 5;
  editor.world.scene.add(mesh);
  let previous: SketchDocument | null = null,
    previousScale = 0,
    visibility = "";
  let regions: { plane: PlaneFrame; boundaries: CurveSpan[][] }[] = [];
  const update = () => {
    const scale = editor.world.height / editor.world.canvas.clientHeight;
    if (
      previous === editor.display &&
      previousScale === scale &&
      visibility === editor.visibility.key
    )
      return;
    if (previous !== editor.display || visibility !== editor.visibility.key)
      regions = editor.display.sketches
        .filter((s) => editor.visibility.visible(s.id))
        .map((sketch) => ({
          plane: sketch.plane,
          boundaries: closedBoundaries(sketch.curves),
        }));
    visibility = editor.visibility.key;
    previous = editor.display;
    previousScale = scale;
    const positions: number[] = [];
    for (const { plane, boundaries } of regions) {
      for (const boundary of boundaries) {
        const cell = boundaryPoints(boundary, scale);
        const contour = cell.map((p) => new THREE.Vector2(p.x, p.y));
        for (const triangle of THREE.ShapeUtils.triangulateShape(contour, [])) {
          for (const index of triangle) {
            const point = cell[index];
            if (point) positions.push(...worldPoint(plane, point));
          }
        }
      }
    }
    mesh.geometry.dispose();
    mesh.geometry = new THREE.BufferGeometry();
    mesh.geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    mesh.visible = positions.length > 0;
  };
  editor.world.changed.add(update);
  update();
  return () => {
    editor.world.changed.delete(update);
    editor.world.scene.remove(mesh);
    mesh.geometry.dispose();
    material.dispose();
  };
}
