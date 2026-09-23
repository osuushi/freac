import { displayPoints } from "./curve-geometry.js";
import type { SketchEditor } from "./editor.js";
import { distance } from "./geometry.js";
import { onModelKeydown } from "./model-keys.js";
import { type Hit, pointKey } from "./picking.js";
import { pointChoiceGroups } from "./point-choice-groups.js";
import { PointLinkControls } from "./point-link-controls.js";
import {
  choosePoints,
  openPointMenu,
  pointBranches,
  pointSelected,
  selectedPointHits,
} from "./point-selection.js";

const ns = "http://www.w3.org/2000/svg";
export class PointChooser {
  private readonly root = document.createElement("div");
  private previous: SketchEditor["pointMenu"] = null;
  private compact = false;
  private grouping = "";
  private readonly abort = new AbortController();
  private readonly links: PointLinkControls;
  constructor(
    private editor: SketchEditor,
    overlay: HTMLElement,
  ) {
    this.root.className = "point-chooser";
    this.root.setAttribute("role", "group");
    this.root.setAttribute("aria-label", "Choose coincident points");
    overlay.append(this.root);
    this.links = new PointLinkControls(editor, this.root);
    onModelKeydown(
      (event) => {
        if (
          event.key !== "Shift" ||
          editor.blocked ||
          editor.isDragging ||
          !editor.hover ||
          !editor.pointer
        )
          return;
        openPointMenu(editor, editor.hover, editor.pointer, true);
        editor.refresh();
      },
      { signal: this.abort.signal },
    );
    this.root.addEventListener("pointerleave", () => {
      editor.pointHover = null;
      editor.refresh();
    });
    editor.world.changed.add(this.update);
    this.update();
  }
  private diagram(hits: Hit[], centerExtent: number): SVGSVGElement {
    const svg = document.createElementNS(ns, "svg"),
      sketch = this.editor.sketch;
    svg.setAttribute("viewBox", "0 0 52 52");
    svg.setAttribute("aria-hidden", "true");
    if (!sketch) return svg;
    const origin = this.editor.world.projectLocal(sketch.plane, hits[0].point);
    const branches = hits.flatMap(pointBranches);
    for (const branch of branches) {
      const curve = sketch.curves.find((c) => c.id === branch.curve);
      if (!curve) continue;
      let points = displayPoints(
        curve,
        this.editor.world.height / this.editor.world.canvas.clientHeight,
      );
      if (curve.kind === "segment")
        points = Array.from({ length: 17 }, (_, i) => ({
          x: curve.a.x + ((curve.b.x - curve.a.x) * i) / 16,
          y: curve.a.y + ((curve.b.y - curve.a.y) * i) / 16,
        }));
      const projected = points.map((p) => this.editor.world.projectLocal(sketch.plane, p));
      const max = Math.max(...projected.map((p) => distance(p, origin)), 1);
      const factor = 20 / (branch.fraction === null ? centerExtent : Math.min(max, 50));
      const path = document.createElementNS(ns, "polyline");
      path.setAttribute(
        "points",
        projected
          .map((p) => `${26 + (p.x - origin.x) * factor},${26 + (p.y - origin.y) * factor}`)
          .join(" "),
      );
      svg.append(path);
    }
    const point = document.createElementNS(ns, "circle");
    point.setAttribute("cx", "26");
    point.setAttribute("cy", "26");
    point.setAttribute("r", "3");
    svg.append(point);
    return svg;
  }
  private choice(hits: Hit[], index: number, centerExtent: number): HTMLButtonElement {
    const { editor } = this;
    const button = document.createElement("button");
    const keys = new Set(hits.map(pointKey));
    button.type = "button";
    button.setAttribute("aria-label", `Point ${index + 1}`);
    button.dataset.pointKey = pointKey(hits[0]) ?? "";
    button.append(this.diagram(hits, centerExtent));
    const hover = () => {
      editor.pointHover = hits[0];
      editor.refresh();
    };
    button.addEventListener("pointerenter", hover);
    button.addEventListener("focus", hover);
    button.addEventListener("click", (event) => {
      if (editor.blocked || editor.isDragging) return;
      const menu = editor.pointMenu;
      const toggle = event.metaKey || event.ctrlKey;
      const additive = event.shiftKey || toggle;
      const selected = additive ? selectedPointHits(editor) : [];
      const allSelected = hits.every((hit) => selected.some((p) => pointKey(p) === pointKey(hit)));
      const next =
        toggle && allSelected
          ? selected.filter((p) => !keys.has(pointKey(p)))
          : [
              ...selected,
              ...hits.filter((hit) => !selected.some((p) => pointKey(p) === pointKey(hit))),
            ];
      choosePoints(editor, next, additive ? editor.selectedCurves : []);
      editor.pointMenu = menu;
      hover();
    });
    return button;
  }
  private update = (): void => {
    const { editor } = this,
      menu = editor.pointMenu;
    this.root.hidden = !menu || editor.isDragging || !editor.sketch;
    if (!menu) {
      this.previous = null;
      return;
    }
    const groups = editor.sketch ? pointChoiceGroups(editor.sketch, menu.hits) : [];
    const grouping = JSON.stringify(groups.map((group) => group.map(pointKey)));
    const compact = !menu.inspect && groups.length === 1 && groups[0].length > 1;
    if (menu !== this.previous || compact !== this.compact || grouping !== this.grouping) {
      this.previous = menu;
      this.compact = compact;
      this.grouping = grouping;
      this.root.classList.toggle("compact", compact);
      this.root.replaceChildren();
      const sketch = editor.sketch;
      const centerExtent = Math.max(
        1,
        ...menu.hits.flatMap((hit) =>
          pointBranches(hit)
            .filter((branch) => branch.fraction === null)
            .flatMap((branch) => {
              const curve = sketch?.curves.find((c) => c.id === branch.curve);
              if (!curve || !sketch) return [];
              const center = editor.world.projectLocal(sketch.plane, hit.point);
              return displayPoints(
                curve,
                editor.world.height / editor.world.canvas.clientHeight,
              ).map((p) => distance(editor.world.projectLocal(sketch.plane, p), center));
            }),
        ),
      );
      for (const [index, hits] of (compact ? [] : groups).entries())
        this.root.append(this.choice(hits, index, centerExtent));
      const hint = document.createElement("span");
      hint.textContent = "Shift adds · Command/Ctrl toggles";
      hint.className = "point-choice-hint";
      if (!compact) this.root.append(hint);
      this.links.attach(this.root);
    }
    for (const button of this.root.querySelectorAll<HTMLButtonElement>("button[data-point-key]"))
      button.setAttribute(
        "aria-pressed",
        String(
          groups
            .find((group) => pointKey(group[0]) === button.dataset.pointKey)
            ?.every((hit) => pointSelected(editor, pointKey(hit) ?? "")) ?? false,
        ),
      );
    this.links.update(compact);
    const rect = editor.world.canvas.getBoundingClientRect();
    this.root.style.left = `${Math.max(8, Math.min(rect.width - this.root.offsetWidth - 8, menu.screen.x - rect.left + 18))}px`;
    this.root.style.top = `${Math.max(65, Math.min(rect.height - this.root.offsetHeight - 8, menu.screen.y - rect.top + 18))}px`;
  };
  dispose(): void {
    this.links.dispose();
    this.abort.abort();
    this.editor.world.changed.delete(this.update);
    this.root.remove();
  }
}
