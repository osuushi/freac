import { idleReason, toolCatalog } from "../tools/catalog.js";
import type { PointReference } from "./document.js";
import type { SketchEditor } from "./editor.js";
import { makePointOnEdge } from "./point-incidence.js";

import { sketchIcon } from "./sketch-icons.js";

export class PointEdgeControls {
  private disposeTool: () => void;
  private readonly root = document.createElement("div");
  private readonly button = document.createElement("button");
  constructor(
    private editor: SketchEditor,
    overlay: HTMLElement,
  ) {
    this.disposeTool = toolCatalog(editor).register({
      id: "point-on-edge",
      label: "Point on edge",
      category: "Constrain",
      aliases: ["coincident point edge"],
      reason: () => this.reason(),
      run: () => this.apply(),
    });
    this.root.className = "line-constraints";
    this.button.type = "button";
    this.button.setAttribute("aria-label", "Constrain point on edge");
    this.button.append(sketchIcon("coincident"), "Coincident");
    this.button.addEventListener("click", () => void toolCatalog(editor).invoke("point-on-edge"));
    this.root.append(this.button);
    overlay.append(this.root);
    editor.world.changed.add(this.update);
    this.update();
  }
  private pair() {
    const hits = this.editor.selected.pointHits(this.editor.sketch);
    if (hits.length !== 1 || this.editor.selectedCurves.size !== 1) return null;
    const hit = hits[0];
    const point: PointReference | null =
      hit.kind === "endpoint"
        ? hit.endpoint
        : hit.kind === "circleCenter"
          ? { curve: hit.curve, end: "center" }
          : null;
    const edge = [...this.editor.selectedCurves][0];
    return point &&
      point.curve !== edge &&
      this.editor.sketch?.curves.find((c) => c.id === edge)?.kind !== "bezier"
      ? { point, edge, hit }
      : null;
  }
  private async apply(): Promise<void> {
    const pair = this.pair(),
      sketch = this.editor.sketch;
    if (!pair || !sketch || this.editor.blocked || this.editor.isDragging) return;
    const edgeFirst = this.editor.selected.orderedKeys(sketch)[0] === pair.edge;
    try {
      await this.editor.editSketch(makePointOnEdge(sketch, pair.point, pair.edge, edgeFirst), {
        kind: "pair",
        points: edgeFirst ? undefined : [pair.point],
        subject: edgeFirst ? pair.edge : pair.point.curve,
        reference: edgeFirst ? pair.point.curve : pair.edge,
      });
    } catch (error) {
      this.editor.message = String(error);
    }
    this.editor.refresh();
  }
  private reason(): string | null {
    const pair = this.pair(),
      sketch = this.editor.sketch;
    if (!pair || !sketch) return "Select one sketch point and another curve";
    if (
      sketch.constraints.some(
        (c) =>
          c.kind === "point-on-edge" &&
          c.edge === pair.edge &&
          c.point.curve === pair.point.curve &&
          c.point.end === pair.point.end,
      )
    )
      return "That relationship already exists";
    return idleReason(this.editor);
  }
  private update = (): void => {
    this.root.hidden = !!this.reason() || this.editor.isDragging;
    this.button.disabled = this.editor.blocked;
  };
  dispose(): void {
    this.disposeTool();
    this.editor.world.changed.delete(this.update);
    this.root.remove();
  }
}
