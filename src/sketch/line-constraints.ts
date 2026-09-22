import { idleReason, toolCatalog } from "../tools/catalog.js";
import { constraintCurves, geometricRelations } from "./constraint-geometry.js";
import { type Constraint, newId, type Segment } from "./document.js";
import type { SketchEditor } from "./editor.js";
import { distance } from "./geometry.js";
import { lineDimension } from "./line-edit.js";
import { sketchIcon } from "./sketch-icons.js";

type RelationKind = "horizontal" | "vertical" | "parallel" | "equal";
export function selectedLines(editor: SketchEditor): Segment[] {
  const sketch = editor.sketch;
  if (!sketch) return [];
  const ids = editor.selectedCurves.size
    ? editor.selectedCurves
    : editor.selectionOwners.size === 1
      ? editor.selectionOwners
      : new Set<string>();
  return [...ids].flatMap((id) => {
    const curve = sketch.curves.find((c) => c.id === id);
    return curve?.kind === "segment" && !sketch.groups.some((g) => g.members.includes(id))
      ? [curve]
      : [];
  });
}
function relationReason(editor: SketchEditor, kind: RelationKind): string | null {
  const lines = selectedLines(editor),
    count = kind === "parallel" || kind === "equal" ? 2 : 1;
  if (!editor.sketch || lines.length !== count || lines.length !== editor.selectionOwners.size)
    return `Select ${count === 1 ? "one independent sketch line" : "two independent sketch lines"}`;
  if (
    geometricRelations(editor.sketch).some(
      (c) =>
        c.kind === kind &&
        constraintCurves(c).length === count &&
        constraintCurves(c).every((id) => lines.some((line) => line.id === id)),
    )
  )
    return "That relationship already exists";
  return idleReason(editor);
}
async function apply(editor: SketchEditor, kind: RelationKind): Promise<void> {
  const sketch = editor.sketch,
    [subject, reference] = selectedLines(editor);
  if (!sketch || !subject || editor.blocked || editor.isDragging) return;
  try {
    const pair = kind === "parallel" || kind === "equal";
    if (pair && !reference) return;
    const ids = pair ? [subject.id, reference.id] : [subject.id];
    if (
      geometricRelations(sketch).some(
        (c) =>
          c.kind === kind &&
          constraintCurves(c).length === ids.length &&
          constraintCurves(c).every((id) => ids.includes(id)),
      )
    )
      throw new Error("That relationship already exists");
    let changed = sketch;
    const angle = Math.atan2(subject.b.y - subject.a.y, subject.b.x - subject.a.x);
    if (kind === "equal")
      changed = lineDimension(sketch, subject.id, "length", distance(reference.a, reference.b));
    else {
      let desired =
        kind === "horizontal"
          ? 0
          : kind === "vertical"
            ? Math.PI / 2
            : Math.atan2(reference.b.y - reference.a.y, reference.b.x - reference.a.x);
      if (Math.cos(angle - desired) < 0) desired += Math.PI;
      changed = lineDimension(sketch, subject.id, "angle", (desired * 180) / Math.PI);
    }
    const constraint: Constraint = pair
      ? { id: newId(), kind, a: subject.id, b: reference.id }
      : { id: newId(), kind, a: subject.id };
    await editor.editSketch(
      { ...changed, constraints: [...changed.constraints, constraint] },
      { kind: "pair", subject: subject.id, reference: pair ? reference.id : undefined },
    );
  } catch (error) {
    editor.message = error instanceof Error ? error.message : String(error);
  }
  editor.refresh();
}
export class LineConstraints {
  private readonly element = document.createElement("div");
  private key = "";
  private disposers: (() => void)[] = [];
  constructor(
    private editor: SketchEditor,
    overlay: HTMLElement,
  ) {
    for (const kind of ["horizontal", "vertical", "parallel", "equal"] as const)
      this.disposers.push(
        toolCatalog(editor).register({
          id: `constraint-${kind}`,
          label: kind === "equal" ? "Equal length" : kind[0].toUpperCase() + kind.slice(1),
          category: "Constrain",
          reason: () => relationReason(editor, kind),
          run: () => apply(editor, kind),
        }),
      );
    this.element.className = "line-constraints";
    this.element.setAttribute("role", "group");
    this.element.setAttribute("aria-label", "Line relationships");
    overlay.append(this.element);
    editor.world.changed.add(this.update);
  }
  private update = (): void => {
    const { editor } = this,
      sketch = editor.sketch,
      lines = selectedLines(editor);
    const available =
      lines.length === editor.selectionOwners.size && (lines.length === 1 || lines.length === 2);
    this.element.hidden = !available || editor.isDragging || !!editor.pointMenu;
    if (!available || !sketch) return;
    const kinds: RelationKind[] =
      lines.length === 1 ? ["horizontal", "vertical"] : ["parallel", "equal"];
    const missing = kinds.filter((kind) => !relationReason(editor, kind));
    this.element.hidden ||= !missing.length;
    const key = missing.join();
    if (key !== this.key) {
      this.key = key;
      this.element.replaceChildren();
      for (const kind of missing) {
        const button = document.createElement("button");
        button.type = "button";
        button.textContent =
          kind === "equal" ? "Equal length" : kind[0].toUpperCase() + kind.slice(1);
        button.setAttribute("aria-label", `Constrain ${button.textContent.toLowerCase()}`);
        button.prepend(sketchIcon(kind));
        button.dataset.action = "line-constraint";
        button.addEventListener(
          "click",
          () => void toolCatalog(editor).invoke(`constraint-${kind}`),
        );
        this.element.append(button);
      }
    }
    for (const button of this.element.querySelectorAll("button")) button.disabled = editor.blocked;
  };
  dispose(): void {
    for (const dispose of this.disposers) dispose();
    this.editor.world.changed.delete(this.update);
    this.element.remove();
  }
}
