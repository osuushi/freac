import * as THREE from "three";
import type { SketchEditor } from "../sketch/editor.js";
import { planeCorners } from "../sketch/plane-bounds.js";
import { planePatch, positionPlanePatch } from "../sketch/plane-target-mesh.js";
import type { PlaneFrame } from "../sketch/planes.js";

/** A transient plane cue, separate from saved construction-plane geometry. */
export class CrossSectionPlaneView {
  private patch = planePatch("#e5a64b");
  private outline = new THREE.LineLoop(
    new THREE.BufferGeometry(),
    new THREE.LineBasicMaterial({ color: "#b87313", depthTest: false }),
  );
  private key = "";
  constructor(private editor: SketchEditor) {
    this.patch.material.stencilWrite = false;
    this.patch.material.opacity = 0.12;
    this.outline.renderOrder = 10;
    editor.world.scene.add(this.patch, this.outline);
  }
  update(frame: PlaneFrame | null): void {
    this.patch.visible = this.outline.visible = !!frame;
    if (!frame) return;
    const bounds = this.editor.world.planeBounds(frame);
    positionPlanePatch(this.patch, frame, bounds);
    const key = JSON.stringify([frame, bounds]);
    if (key === this.key) return;
    this.key = key;
    this.outline.geometry.dispose();
    this.outline.geometry = new THREE.BufferGeometry().setFromPoints(
      planeCorners(frame, bounds).map((v) => new THREE.Vector3(...v)),
    );
  }
  dispose(): void {
    for (const object of [this.patch, this.outline]) {
      this.editor.world.scene.remove(object);
      object.geometry.dispose();
      object.material.dispose();
    }
  }
}
