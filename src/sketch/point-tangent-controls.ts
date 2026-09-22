import { idleReason, toolCatalog } from "../tools/catalog.js";
import { constraintCurves } from "./constraint-geometry.js";
import type { SketchEditor } from "./editor.js";
import { selectedPointHits, tangentPointPair } from "./point-selection.js";
import { sketchIcon } from "./sketch-icons.js";
import { makeTangent } from "./tangency.js";

export class PointTangentControls {
  private disposeTool: () => void;
  private readonly root = document.createElement("div");
  private readonly tangent = document.createElement("button");
  constructor(
    private editor: SketchEditor,
    overlay: HTMLElement,
  ) {
    this.disposeTool = toolCatalog(editor).register({
      id: "point-tangent",
      label: "Tangent at points",
      category: "Constrain",
      aliases: ["point tangency"],
      reason: () => this.reason(),
      run: () => this.apply(),
    });
    this.root.className = "line-constraints";
    this.root.setAttribute("role", "group");
    this.root.setAttribute("aria-label", "Point relationships");
    this.tangent.type = "button";
    this.tangent.setAttribute("aria-label", "Constrain tangent");
    this.tangent.dataset.action = "point-tangent";
    this.tangent.append(sketchIcon("tangent"), "Tangent");
    this.tangent.addEventListener("click", () => void toolCatalog(editor).invoke("point-tangent"));
    this.root.append(this.tangent);
    overlay.append(this.root);
    editor.world.changed.add(this.update);
    this.update();
  }
  private pair() {
    const sketch = this.editor.sketch;
    return sketch ? tangentPointPair(sketch, selectedPointHits(this.editor, sketch)) : null;
  }
  private async apply(): Promise<void> {
    const sketch = this.editor.sketch,
      pair = this.pair();
    if (!sketch || !pair || this.editor.blocked || this.editor.isDragging) return;
    try {
      await this.editor.editSketch(makeTangent(sketch, pair[0], pair[1]), {
        kind: "pair",
        subject: pair[0].id,
        reference: pair[1].id,
      });
    } catch (error) {
      this.editor.message = error instanceof Error ? error.message : String(error);
    }
    this.editor.refresh();
  }
  private reason(): string | null {
    const pair = this.pair(),
      sketch = this.editor.sketch;
    if (!pair || !sketch) return "Select compatible points on two sketch curves";
    if (
      sketch.constraints.some(
        (c) =>
          c.kind === "tangent" &&
          constraintCurves(c).every((id) => pair.some((curve) => curve.id === id)),
      )
    )
      return "That relationship already exists";
    return idleReason(this.editor);
  }
  private update = (): void => {
    this.root.hidden = !!this.reason() || this.editor.isDragging;
    this.tangent.disabled = this.editor.blocked;
  };
  dispose(): void {
    this.disposeTool();
    this.editor.world.changed.delete(this.update);
    this.root.remove();
  }
}
