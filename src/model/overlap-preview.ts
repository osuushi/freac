import { displayPoints } from "../sketch/curve-geometry.js";
import type { SketchEditor } from "../sketch/editor.js";
import { coplanar, type Point, type Vector, worldPoint } from "../sketch/planes.js";
import type { OverlapCandidate } from "./overlap-candidates.js";
import { overlapGeometry, type PreviewGeometry } from "./overlap-geometry.js";

const ns = "http://www.w3.org/2000/svg";
/** All thumbnails retain the camera and a shared framing, so targets can be compared. */
export function overlapPreviews(
  editor: SketchEditor,
  candidates: OverlapCandidate[],
): SVGSVGElement[] {
  const context = overlapGeometry(editor);
  const targets = candidates.map((c) => {
    const geometry = overlapGeometry(editor, c.target);
    if (c.target.kind === "plane") {
      const frame = c.target.frame;
      for (const sketch of editor.display.sketches) {
        if (!editor.visibility.visible(sketch.id) || !coplanar(sketch.plane, frame)) continue;
        for (const curve of sketch.curves)
          geometry.lines.push(
            displayPoints(curve, editor.world.height / editor.world.canvas.clientHeight).map((p) =>
              worldPoint(sketch.plane, p),
            ),
          );
      }
    }
    return geometry;
  });
  const all = [context, ...targets]
    .flatMap((g) => [...g.surfaces, ...g.lines])
    .flat()
    .map((p) => editor.world.project(p));
  let left = Infinity,
    right = -Infinity,
    top = Infinity,
    bottom = -Infinity;
  for (const p of all) {
    left = Math.min(left, p.x);
    right = Math.max(right, p.x);
    top = Math.min(top, p.y);
    bottom = Math.max(bottom, p.y);
  }
  const scale = Math.min(128 / Math.max(1, right - left), 88 / Math.max(1, bottom - top));
  const project = (p: Vector): Point => {
    const q = editor.world.project(p);
    return {
      x: 72 + (q.x - (left + right) / 2) * scale,
      y: 52 + (q.y - (top + bottom) / 2) * scale,
    };
  };
  return targets.map((target) => {
    const svg = document.createElementNS(ns, "svg");
    svg.setAttribute("viewBox", "0 0 144 104");
    svg.setAttribute("aria-hidden", "true");
    draw(svg, context, project, "#dbe1e8", "#aab5c1");
    draw(svg, target, project, "#8cbde8", "#1269b5");
    return svg;
  });
}
function draw(
  svg: SVGSVGElement,
  geometry: PreviewGeometry,
  project: (p: Vector) => Point,
  fill: string,
  stroke: string,
): void {
  for (const [paths, closed] of [
    [geometry.surfaces, true],
    [geometry.lines, false],
  ] as const) {
    const path = document.createElementNS(ns, "path");
    path.setAttribute(
      "d",
      paths
        .map((points) => {
          const projected = points.map(project);
          // A solid's opposite triangle windings must not cancel its SVG silhouette.
          const area = projected.reduce((sum, p, i) => {
            const q = projected[(i + 1) % projected.length];
            return sum + p.x * q.y - q.x * p.y;
          }, 0);
          if (closed && area < 0) projected.reverse();
          return (
            projected
              .map((q, i) => `${i ? "L" : "M"}${q.x.toFixed(2)},${q.y.toFixed(2)}`)
              .join(" ") + (closed ? " Z" : "")
          );
        })
        .join(" "),
    );
    path.setAttribute("fill", closed ? fill : "none");
    path.setAttribute("stroke", closed ? "none" : stroke);
    path.setAttribute("stroke-width", "1.5");
    path.setAttribute("stroke-linejoin", "round");
    svg.append(path);
  }
}
