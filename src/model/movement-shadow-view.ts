import type { SketchEditor } from "../sketch/editor.js";
import type { Vector } from "../sketch/planes.js";
import { type ShadowGeometry, shadowPaths, shadowPlanes } from "./movement-shadow-geometry.js";
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
  const id = `movement-shadow-${serial++}`;
  const group = element("g");
  const mask = element("mask", { id, maskUnits: "userSpaceOnUse", "mask-type": "luminance" });
  const background = element("rect", { fill: "white" });
  const cutout = element("path", { fill: "black", stroke: "none" });
  mask.append(background, cutout);
  const surface = element("path", { mask: `url(#${id})`, "vector-effect": "non-scaling-stroke" });
  const lines = element("path", { "vector-effect": "non-scaling-stroke" });
  group.append(mask, surface, lines);
  parent.append(group);
  return { group, mask, background, cutout, surface, lines };
}
type Layer = ReturnType<typeof layer>;
function setGeometry(
  target: Layer,
  geometry: ShadowGeometry,
  axes: readonly [number, number],
  pad: number,
) {
  const paths = shadowPaths(geometry, axes);
  target.surface.setAttribute("d", paths.surface);
  target.cutout.setAttribute("d", paths.surface);
  target.lines.setAttribute("d", paths.lines);
  let left = Infinity,
    right = -Infinity,
    top = Infinity,
    bottom = -Infinity;
  for (const points of [...geometry.triangles, ...geometry.lines])
    for (const p of points) {
      left = Math.min(left, p[axes[0]]);
      right = Math.max(right, p[axes[0]]);
      top = Math.min(top, p[axes[1]]);
      bottom = Math.max(bottom, p[axes[1]]);
    }
  if (!Number.isFinite(left)) return;
  for (const node of [target.mask, target.background])
    for (const [key, value] of Object.entries({
      x: left - pad,
      y: top - pad,
      width: right - left + pad * 2,
      height: bottom - top + pad * 2,
    }))
      node.setAttribute(key, String(value));
}

/** Masking the silhouette's interior removes triangulation strokes without a model operation. */
export class MovementShadowView {
  readonly root = element("svg", { class: "movement-shadows", "aria-hidden": "true" });
  private planes = shadowPlanes.map((plane) => {
    const root = element("g", { "data-plane": plane.name });
    const projected = element("g");
    const start = layer(projected),
      current = layer(projected);
    start.group.classList.add("shadow-start");
    current.group.classList.add("shadow-current");
    const tether = element("path", { class: "shadow-tether" });
    const label = element("text", { class: "shadow-label" });
    label.textContent = plane.name;
    root.append(projected, tether, label);
    this.root.append(root);
    return { ...plane, root, projected, start, current, tether, label };
  });
  private previous: ShadowGeometry | null = null;
  private original: ShadowGeometry | null = null;
  private padding = 0;
  constructor(private editor: SketchEditor) {
    this.root.style.display = "none";
    editor.world.overlay.prepend(this.root);
  }
  draw(
    current: ShadowGeometry,
    original: ShadowGeometry | null,
    anchor: Vector,
    normal: number,
  ): void {
    const world = this.editor.world,
      bounds = world.canvas.getBoundingClientRect();
    this.root.style.display = "";
    this.root.dataset.moving = String(!!original);
    this.root.setAttribute("viewBox", `0 0 ${bounds.width} ${bounds.height}`);
    const origin = world.project([0, 0, 0]);
    const pad = (world.height / bounds.height) * 6;
    const labels: { x: number; y: number }[] = [];
    for (const plane of this.planes) {
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
      if (current !== this.previous || pad !== this.padding)
        setGeometry(plane.current, current, plane.axes, pad);
      if (original && (original !== this.original || pad !== this.padding))
        setGeometry(plane.start, original, plane.axes, pad);
      plane.start.group.style.display = original ? "" : "none";
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
    this.original = original;
    this.padding = pad;
  }
  hide(): void {
    this.root.style.display = "none";
  }
  dispose(): void {
    this.root.remove();
  }
}
