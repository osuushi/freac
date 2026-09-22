import { displayPoints } from "./curve-geometry.js";
import type { Sketch } from "./document.js";
import type { FilletCorner } from "./fillet-geometry.js";
import { filletGuideShape } from "./fillet-guide-shape.js";
import type { World } from "./world.js";

export class FilletGuide {
  readonly element = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  readonly hit = document.createElementNS(this.element.namespaceURI, "path") as SVGPathElement;
  private readonly curve = document.createElementNS(this.element.namespaceURI, "path");
  radius = 0;
  private cornerKey = "";
  private hintRadius = 0;
  constructor() {
    this.element.classList.add("fillet-guide-layer");
    this.curve.classList.add("fillet-guide");
    this.curve.setAttribute("aria-hidden", "true");
    this.hit.classList.add("fillet-guide-hit");
    this.hit.setAttribute("role", "button");
    this.hit.setAttribute("aria-label", "Round corner");
    this.hit.dataset.action = "fillet";
    this.element.append(this.curve, this.hit);
  }
  update(
    corner: FilletCorner | null,
    sketch: Sketch | undefined,
    world: World,
    radius?: number,
  ): void {
    this.element.style.display = !corner || !sketch ? "none" : "";
    if (!corner || !sketch) {
      this.cornerKey = "";
      return;
    }
    const bounds = world.canvas.getBoundingClientRect();
    const unit = world.height / bounds.height;
    const key = JSON.stringify([sketch.id, corner.a, corner.b, corner.aEnd, corner.bEnd]);
    if (key !== this.cornerKey) {
      this.cornerKey = key;
      this.hintRadius = Math.min(
        corner.limit * 0.7,
        Math.max(12 * unit, (32 * unit) / (1 / Math.sin(corner.half) - 1)),
      );
    }
    // Keep the hint in world space so zooming in makes crowded corners usable.
    this.radius = radius ?? this.hintRadius;
    const result = filletGuideShape(corner, this.radius, radius !== undefined);
    if (!result) {
      this.element.style.display = "none";
      return;
    }
    this.radius = result.radius;
    const { shape } = result;
    const points = displayPoints(shape, unit).map((point) =>
      world.projectLocal(sketch.plane, point),
    );
    const path = points
      .map((point, i) => `${i ? "L" : "M"}${point.x - bounds.left},${point.y - bounds.top}`)
      .join(" ");
    this.element.setAttribute("viewBox", `0 0 ${bounds.width} ${bounds.height}`);
    this.curve.setAttribute("d", path);
    this.hit.setAttribute("d", path);
    this.curve.setAttribute("opacity", radius === undefined ? "0.35" : "0");
  }
}
