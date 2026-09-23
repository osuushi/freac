import type { SketchEditor } from "../sketch/editor.js";
import type { Vector } from "../sketch/planes.js";
import { type ShadowGeometry, shadowPaths, shadowPlanes } from "./movement-shadow-geometry.js";
import { ShadowOcclusion } from "./shadow-occlusion.js";
import "./movement-shadows.css";

const ns = "http://www.w3.org/2000/svg";
let serial = 0;
function element<K extends keyof SVGElementTagNameMap>(
  name: K,
  attributes: Record<string, string> = {},
) {
  const node = document.createElementNS(ns, name);
  for (const [key, value] of Object.entries(attributes)) node.setAttribute(key, value);
  return node;
}
function layer(parent: SVGGElement) {
  const group = element("g", { class: "shadow-current" });
  const surface = element("path", { class: "shadow-surface" });
  const lines = element("path", { class: "shadow-lines", "vector-effect": "non-scaling-stroke" });
  group.append(surface, lines);
  parent.append(group);
  return { surface, lines };
}
function setGeometry(
  target: ReturnType<typeof layer>,
  geometry: ShadowGeometry,
  axes: readonly [number, number],
) {
  const paths = shadowPaths(geometry, axes);
  target.surface.setAttribute("d", paths.surface);
  target.lines.setAttribute("d", paths.lines);
}

/** Blur the union silhouette in screen space, keeping softness constant through zoom. */
export class MovementShadowView {
  readonly root = element("svg", { class: "movement-shadows", "aria-hidden": "true" });
  private blur = element("filter", {
    id: `movement-shadow-blur-${serial++}`,
    filterUnits: "userSpaceOnUse",
    x: "-12",
    y: "-12",
    "color-interpolation-filters": "sRGB",
  });
  private planes = shadowPlanes.map((plane) => {
    const root = element("g", { "data-plane": plane.name });
    const mask = element("mask", {
      id: `${this.blur.id}-${plane.name}`,
      maskUnits: "userSpaceOnUse",
      "mask-type": "luminance",
      x: "0",
      y: "0",
    });
    const background = element("rect", { fill: "white" });
    const occluder = element("path", { class: "shadow-occluder" });
    mask.append(background, occluder);
    const clipped = element("g", { mask: `url(#${mask.id})` });
    const soft = element("g", { class: "shadow-soft", filter: `url(#${this.blur.id})` });
    const projected = element("g");
    const current = layer(projected);
    soft.append(projected);
    clipped.append(soft);
    const tether = element("path", { class: "shadow-tether" });
    const label = element("text", { class: "shadow-label" });
    label.textContent = plane.name;
    root.append(clipped, tether, label);
    this.root.append(root);
    return { ...plane, root, projected, current, tether, label, mask, background, occluder };
  });
  private occlusion = new ShadowOcclusion();
  private previous: ShadowGeometry | null = null;
  constructor(private editor: SketchEditor) {
    this.blur.append(element("feGaussianBlur", { stdDeviation: "3" }));
    const definitions = element("defs");
    definitions.append(this.blur);
    for (const plane of this.planes) definitions.append(plane.mask);
    this.root.prepend(definitions);
    this.root.style.display = "none";
    editor.world.overlay.prepend(this.root);
  }
  draw(current: ShadowGeometry, moving: boolean, anchor: Vector, normal: number): void {
    const world = this.editor.world,
      bounds = world.canvas.getBoundingClientRect();
    this.root.style.display = "";
    this.root.dataset.moving = String(moving);
    this.root.setAttribute("viewBox", `0 0 ${bounds.width} ${bounds.height}`);
    this.blur.setAttribute("width", String(bounds.width + 24));
    this.blur.setAttribute("height", String(bounds.height + 24));
    const origin = world.project([0, 0, 0]);
    const occluders = this.occlusion.update(this.editor);
    const labels: { x: number; y: number }[] = [];
    for (const [index, plane] of this.planes.entries()) {
      for (const node of [plane.mask, plane.background]) {
        node.setAttribute("width", String(bounds.width));
        node.setAttribute("height", String(bounds.height));
      }
      plane.occluder.setAttribute("d", occluders[index]);
      plane.root.dataset.active = String(plane.normal === normal);
      const basis = plane.axes.map((axis) => {
        const point: Vector = [0, 0, 0];
        point[axis] = 1;
        const p = world.project(point);
        return { x: p.x - origin.x, y: p.y - origin.y };
      });
      plane.projected.setAttribute(
        "transform",
        `matrix(${basis[0].x} ${basis[0].y} ${basis[1].x} ${basis[1].y} ${origin.x - bounds.left} ${origin.y - bounds.top})`,
      );
      if (current !== this.previous) setGeometry(plane.current, current, plane.axes);
      const foot: Vector = [...anchor];
      foot[plane.normal] = 0;
      const a = world.project(anchor),
        b = world.project(foot);
      plane.tether.setAttribute(
        "d",
        `M${a.x - bounds.left},${a.y - bounds.top}L${b.x - bounds.left},${b.y - bounds.top}`,
      );
      const label = { x: b.x - bounds.left + 8, y: b.y - bounds.top - 8 };
      while (labels.some((p) => Math.abs(p.x - label.x) < 25 && Math.abs(p.y - label.y) < 15))
        label.y += 16;
      labels.push(label);
      plane.label.setAttribute("x", String(label.x));
      plane.label.setAttribute("y", String(label.y));
    }
    this.previous = current;
  }
  hide(): void {
    this.root.style.display = "none";
  }
  dispose(): void {
    this.root.remove();
  }
}
