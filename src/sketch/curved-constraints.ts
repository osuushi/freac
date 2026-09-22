import { idleReason, toolCatalog } from "../tools/catalog.js";
import { constraintCurves } from "./constraint-geometry.js";
import type { Curve } from "./document.js";
import type { SketchEditor } from "./editor.js";
import { makeCoincident } from "./point-links.js";
import { sketchIcon } from "./sketch-icons.js";
import { makeTangent } from "./tangency.js";

export class CurvedConstraints {
  private disposers: (() => void)[] = [];
  private readonly root = document.createElement("div");
  private readonly tangent = document.createElement("button");
  private readonly concentric = document.createElement("button");
  constructor(
    private editor: SketchEditor,
    overlay: HTMLElement,
  ) {
    for (const kind of ["concentric", "tangent"] as const)
      this.disposers.push(
        toolCatalog(editor).register({
          id: `constraint-${kind}`,
          label: kind === "tangent" ? "Tangent curves" : "Concentric",
          category: "Constrain",
          reason: () => this.reason(kind),
          run: () => this.apply(kind),
        }),
      );
    this.root.className = "line-constraints";
    this.root.setAttribute("role", "group");
    this.root.setAttribute("aria-label", "Curved relationships");
    this.concentric.type = "button";
    this.concentric.textContent = "Concentric";
    this.concentric.setAttribute("aria-label", "Constrain concentric");
    this.concentric.dataset.action = "concentric";
    this.concentric.addEventListener(
      "click",
      () => void toolCatalog(editor).invoke("constraint-concentric"),
    );
    this.tangent.type = "button";
    this.tangent.textContent = "Tangent";
    this.tangent.setAttribute("aria-label", "Constrain tangent");
    this.tangent.dataset.action = "tangent";
    this.tangent.addEventListener(
      "click",
      () => void toolCatalog(editor).invoke("constraint-tangent"),
    );
    this.concentric.prepend(sketchIcon("concentric"));
    this.tangent.prepend(sketchIcon("tangent"));
    this.root.append(this.concentric, this.tangent);
    overlay.append(this.root);
    editor.world.changed.add(this.update);
    this.update();
  }
  private selected(): Curve[] {
    const { editor } = this;
    return [...editor.selectionOwners].flatMap((id) => {
      const curve = editor.sketch?.curves.find((c) => c.id === id);
      return curve && !editor.sketch?.groups.some((g) => g.members.includes(id)) ? [curve] : [];
    });
  }
  private async apply(kind: "concentric" | "tangent"): Promise<void> {
    const { editor } = this,
      sketch = editor.sketch,
      pair = this.selected();
    if (!sketch || editor.blocked || editor.isDragging || pair.length !== 2) return;
    try {
      await editor.editSketch(
        kind === "tangent"
          ? makeTangent(sketch, pair[0], pair[1])
          : makeCoincident(
              sketch,
              pair.map((curve) => ({ curve: curve.id, end: "center" })),
            ),
        { kind: "pair", subject: pair[0].id, reference: pair[1].id },
      );
    } catch (error) {
      editor.message = error instanceof Error ? error.message : String(error);
    }
    editor.refresh();
  }
  private reason(kind: "concentric" | "tangent"): string | null {
    const e = this.editor,
      sketch = e.sketch,
      pair = this.selected();
    if (
      !sketch ||
      pair.length !== 2 ||
      e.selectionOwners.size !== 2 ||
      pair.every((c) => c.kind === "segment") ||
      e.selectedPoint
    )
      return "Select two compatible sketch curves";
    if (kind === "concentric" && pair.some((c) => c.kind === "segment" || c.kind === "bezier"))
      return "Select two circles or arcs";
    if (
      sketch.constraints.some(
        (c) =>
          (kind === "tangent"
            ? c.kind === "tangent"
            : c.kind === "coincident" && c.a.end === "center" && c.b.end === "center") &&
          constraintCurves(c).every((id) => pair.some((curve) => curve.id === id)),
      )
    )
      return "That relationship already exists";
    return idleReason(e);
  }
  private update = (): void => {
    this.concentric.hidden = !!this.reason("concentric");
    this.tangent.hidden = !!this.reason("tangent");
    this.root.hidden =
      (this.concentric.hidden && this.tangent.hidden) ||
      this.editor.isDragging ||
      !!this.editor.pointMenu;
    this.concentric.disabled = this.tangent.disabled = this.editor.blocked;
  };
  dispose(): void {
    for (const dispose of this.disposers) dispose();
    this.editor.world.changed.delete(this.update);
    this.root.remove();
  }
}
