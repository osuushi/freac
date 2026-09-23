import { displayPoints } from "../sketch/curve-geometry.js";
import type { SketchDocument } from "../sketch/document.js";
import { type Vector, worldPoint } from "../sketch/planes.js";
import type { ScaleSource } from "./scale.js";

export interface ShadowGeometry {
  triangles: Vector[][];
  lines: Vector[][];
}
export function shadowGeometry(
  document: SketchDocument,
  source: ScaleSource,
  tolerance: number,
): ShadowGeometry {
  const triangles: Vector[][] = [],
    lines: Vector[][] = [];
  if (source.kind === "curves" || source.kind === "sketches") {
    for (const sketch of document.sketches) {
      if (
        source.kind === "curves" ? sketch.id !== source.sketchId : !source.ids.includes(sketch.id)
      )
        continue;
      for (const curve of sketch.curves) {
        if (source.kind === "curves" && !source.ids.includes(curve.id)) continue;
        lines.push(displayPoints(curve, tolerance).map((p) => worldPoint(sketch.plane, p)));
      }
    }
  } else {
    for (const body of document.bodies ?? []) {
      const whole = source.ids.includes(body.id);
      for (const face of body.faces) {
        if (!whole && !source.faces.some((f) => f.body === body.id && f.face === face.id)) continue;
        for (let i = 0; i < face.vertices.length; i += 9) {
          triangles.push([0, 3, 6].map((j) => face.vertices.slice(i + j, i + j + 3) as Vector));
        }
      }
      for (const edge of body.edges) {
        if (!source.edges.some((e) => e.body === body.id && e.edge === edge.id)) continue;
        const points: Vector[] = [];
        for (let i = 0; i < edge.points.length; i += 3)
          points.push(edge.points.slice(i, i + 3) as Vector);
        lines.push(points);
      }
    }
  }
  return { triangles, lines };
}

export const shadowPlanes = [
  { name: "XY", axes: [0, 1], normal: 2 },
  { name: "XZ", axes: [0, 2], normal: 1 },
  { name: "YZ", axes: [1, 2], normal: 0 },
] as const;

/** Consistent winding makes overlapping mesh triangles a filled silhouette, including holes. */
export function shadowPaths(geometry: ShadowGeometry, axes: readonly [number, number]) {
  const project = (p: Vector) => [p[axes[0]], p[axes[1]]];
  const path = (points: number[][], closed: boolean) =>
    points.map((p, i) => `${i ? "L" : "M"}${p[0]},${p[1]}`).join(" ") + (closed ? "Z" : "");
  const surface = geometry.triangles
    .map((triangle) => {
      const p = triangle.map(project);
      const area =
        (p[1][0] - p[0][0]) * (p[2][1] - p[0][1]) - (p[1][1] - p[0][1]) * (p[2][0] - p[0][0]);
      if (Math.abs(area) < 1e-12) return "";
      return path(area < 0 ? p.reverse() : p, true);
    })
    .join(" ");
  return { surface, lines: geometry.lines.map((line) => path(line.map(project), false)).join(" ") };
}
