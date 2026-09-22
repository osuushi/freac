import type { SketchEditor } from "../sketch/editor.js";
import { type PlaneFrame, worldPoint } from "../sketch/planes.js";
import type { ConstructionPlane } from "./construction-plane.js";
import { entityRows } from "./entity-presentation.js";
import { renameEntity } from "./entity-rename.js";
import { EntityReorder } from "./entity-reorder.js";
import "./construction-plane.css";

export class ConstructionPlaneView {
  private svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  private labels = document.createElement("div");
  private key = "";
  selected: string | null = null;
  private hovered: string | null = null;
  choosing = false;
  accepts: ((frame: PlaneFrame) => boolean) | undefined;
  constructor(
    private editor: SketchEditor,
    overlay: HTMLElement,
    private rows: HTMLElement,
    private choose: (plane: ConstructionPlane) => void,
    private sketch: (plane: ConstructionPlane) => void,
  ) {
    this.svg.classList.add("construction-plane-view");
    this.labels.className = "construction-plane-labels";
    overlay.append(this.svg, this.labels);
  }
  update(): void {
    this.svg.classList.toggle("cutting", !!this.accepts);
    const e = this.editor,
      planes = e.display.constructionPlanes ?? [];
    const key = JSON.stringify([
      planes,
      e.display.entityPresentation,
      this.choosing,
      planes.map((p) => !this.accepts || this.accepts(p.frame)),
      e.blocked,
      e.world.active,
      e.visibility.key,
      e.world.camera.matrixWorld.elements,
      e.world.height,
      e.world.canvas.clientWidth,
      e.world.canvas.clientHeight,
    ]);
    if (this.key === key) {
      this.selection();
      return;
    }
    this.key = key;
    this.svg.replaceChildren();
    this.labels.replaceChildren();
    this.rows.replaceChildren();
    const heading = document.createElement("h3");
    heading.textContent = `Planes (${planes.length})`;
    this.rows.append(heading);
    for (const row of entityRows(
      e.display,
      planes.map((p) => p.id),
      "Plane",
    )) {
      const plane = planes.find((p) => p.id === row.id);
      if (plane) this.add(plane, row.name);
    }
    this.selection();
  }
  hover(id: string | null): void {
    this.hovered = id;
    this.selection();
  }
  private selection(): void {
    for (const root of [this.svg, this.rows, this.labels])
      for (const item of root.querySelectorAll("[data-plane]")) {
        const selected = item.getAttribute("data-plane") === this.selected;
        if (item.tagName === "polygon") {
          item.classList.toggle("selected", selected);
          item.classList.toggle("hovered", item.getAttribute("data-plane") === this.hovered);
        } else item.setAttribute("aria-pressed", String(selected));
      }
  }
  private add(plane: ConstructionPlane, name: string): void {
    const e = this.editor,
      visible = e.visibility.visible(plane.id),
      allowed = !this.accepts || this.accepts(plane.frame);
    const button = () => {
      const item = document.createElement("button");
      item.textContent = name;
      item.dataset.plane = plane.id;
      item.setAttribute("aria-label", `${this.choosing ? "Use" : "Select"} ${name}`);
      item.setAttribute("aria-pressed", String(this.selected === plane.id));
      item.disabled = e.blocked || !visible || !allowed;
      item.onclick = () => this.choose(plane);
      item.ondblclick = () => {
        if (!this.choosing) this.sketch(plane);
      };
      return item;
    };
    const row = document.createElement("div"),
      eye = document.createElement("button");
    row.className = "entity-row";
    eye.textContent = visible ? "◉" : "○";
    eye.setAttribute("aria-label", `${visible ? "Hide" : "Show"} ${name}`);
    eye.disabled = e.blocked || !!e.interactions.current;
    eye.onclick = () => {
      if (visible) e.visibility.hidden.add(plane.id);
      else e.visibility.hidden.delete(plane.id);
      if (visible && this.selected === plane.id) this.selected = null;
      e.refresh();
    };
    const labelButton = button();
    labelButton.ondblclick = () => renameEntity(e, labelButton, plane.id);
    new EntityReorder(e, row, labelButton, plane.id, "plane");
    row.append(labelButton, eye);
    this.rows.append(row);
    if (!visible || e.world.active || !allowed) return;
    const corners = [
      { x: -20, y: -20 },
      { x: 20, y: -20 },
      { x: 20, y: 20 },
      { x: -20, y: 20 },
    ].map((p) => e.world.project(worldPoint(plane.frame, p)));
    const polygon = document.createElementNS(this.svg.namespaceURI, "polygon");
    polygon.setAttribute("points", corners.map((p) => `${p.x},${p.y}`).join(" "));
    polygon.setAttribute("data-plane", plane.id);
    polygon.setAttribute("class", this.selected === plane.id ? "selected" : "");
    polygon.addEventListener("click", () => {
      if (!e.blocked) this.choose(plane);
    });
    polygon.addEventListener("dblclick", () => {
      if (!this.choosing) this.sketch(plane);
    });
    this.svg.append(polygon);
    const label = button(),
      anchor = corners[2];
    label.style.left = `${anchor.x}px`;
    label.style.top = `${anchor.y}px`;
    this.labels.append(label);
  }
  dispose(): void {
    this.svg.remove();
    this.labels.remove();
    this.rows.replaceChildren();
  }
}
