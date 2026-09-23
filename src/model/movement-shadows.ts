import type * as THREE from "three";
import type { SketchDocument } from "../sketch/document.js";
import type { SketchEditor } from "../sketch/editor.js";
import type { Vector } from "../sketch/planes.js";
import { type ShadowGeometry, shadowGeometry } from "./movement-shadow-geometry.js";
import { MovementShadowView } from "./movement-shadow-view.js";
import type { ScaleSource } from "./scale.js";

/** Temporary projected display geometry; never enters the document or history. */
export class MovementShadows {
  private view: MovementShadowView;
  private source: ScaleSource | null = null;
  private sourceKey = "";
  private document: SketchDocument | null = null;
  private current: ShadowGeometry = { triangles: [], lines: [] };
  private original: ShadowGeometry | null = null;
  private anchor: Vector = [0, 0, 0];
  private normal = 2;
  constructor(private editor: SketchEditor) {
    this.view = new MovementShadowView(editor);
    editor.world.changed.add(this.draw);
  }
  prepare(source: ScaleSource, anchor: Vector, plane: THREE.Plane): void {
    if (this.editor.world.active) return;
    const key = JSON.stringify(source);
    if (key !== this.sourceKey) this.document = null;
    this.sourceKey = key;
    this.source = source;
    this.anchor = [...anchor];
    this.normal = [0, 1, 2].find((i) => Math.abs(plane.normal.getComponent(i)) > 0.9) ?? 2;
    this.draw();
  }
  begin(source: ScaleSource, anchor: Vector, plane: THREE.Plane): void {
    this.prepare(source, anchor, plane);
    if (!this.source) return;
    this.original = this.current;
    this.draw();
  }
  move(anchor: Vector): void {
    this.anchor = [...anchor];
    this.draw();
  }
  private draw = (): void => {
    if (!this.source || this.editor.world.active) {
      this.view.hide();
      return;
    }
    if (this.document !== this.editor.display) {
      this.document = this.editor.display;
      this.current = shadowGeometry(
        this.document,
        this.source,
        this.editor.world.height / this.editor.world.canvas.clientHeight,
      );
    }
    this.view.draw(this.current, this.original, this.anchor, this.normal);
  };
  hide(): void {
    this.source = null;
    this.original = null;
    this.document = null;
    this.view.hide();
  }
  dispose(): void {
    this.editor.world.changed.delete(this.draw);
    this.view.dispose();
  }
}
