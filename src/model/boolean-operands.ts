import * as THREE from "three";
import type { SketchEditor } from "../sketch/editor.js";
import type { Body, BodyBoolean } from "./body.js";
import { featureEdges } from "./feature-edges.js";

/** Temporary operand outlines remain visible even when a preview consumes them. */
export class BooleanOperands {
  private group = new THREE.Group();
  constructor(private editor: SketchEditor) {
    editor.world.scene.add(this.group);
  }
  show(bodies: Body[], mode: BodyBoolean["mode"]): void {
    this.clear();
    bodies.forEach((body, index) => {
      const color = mode === "subtract" && index > 0 ? "#d08a35" : "#287cbd";
      for (const edge of featureEdges(body)) {
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute("position", new THREE.Float32BufferAttribute(edge.points, 3));
        const material = new THREE.LineBasicMaterial({
          color,
          depthTest: false,
          depthWrite: false,
          transparent: true,
          opacity: 0.7,
        });
        const line = new THREE.Line(geometry, material);
        line.renderOrder = 10;
        this.group.add(line);
      }
    });
  }
  clear(): void {
    for (const object of [...this.group.children]) {
      const line = object as THREE.Line<THREE.BufferGeometry, THREE.LineBasicMaterial>;
      line.geometry.dispose();
      line.material.dispose();
      this.group.remove(line);
    }
  }
  dispose(): void {
    this.clear();
    this.editor.world.scene.remove(this.group);
  }
}
