import type { Face } from "../model/body.js";
import type { ExportMesh } from "../model/export-mesh.js";
import type { PlaneFrame, Vector } from "../sketch/planes.js";
import { cross, cylinderCoordinates, cylinderPoint, dot, subtract } from "./cylinder.js";

/** Close the two radial skins using only boundary edges of the shared parameter mesh. */
export function radialShell(
  frame: PlaneFrame,
  coordinates: { angle: number; z: number }[],
  triangles: number[][],
  inner: (a: number, z: number) => number,
  outer: (a: number, z: number) => number,
): ExportMesh {
  const count = coordinates.length;
  const vertices = [inner, outer].flatMap((radius) =>
    coordinates.map(({ angle, z }) => cylinderPoint(frame, angle, z, radius(angle, z))),
  );
  const result: number[][] = [];
  const edges = new Map<string, { a: number; b: number; count: number }>();
  for (const [a, b, c] of triangles) {
    result.push([c, b, a], [a + count, b + count, c + count]);
    for (const [x, y] of [
      [a, b],
      [b, c],
      [c, a],
    ]) {
      const key = x < y ? `${x}/${y}` : `${y}/${x}`;
      const edge = edges.get(key);
      if (edge) edge.count++;
      else edges.set(key, { a: x, b: y, count: 1 });
    }
  }
  for (const { a, b, count: occurrences } of edges.values())
    if (occurrences === 1) result.push([a, b, b + count], [a, b + count, a + count]);
  return { vertices, triangles: result };
}

/** Radial sweep of the selected tessellated face domains, preserving holes and gaps. */
export function faceMask(frame: PlaneFrame, faces: readonly Face[], low: number, high: number) {
  const coords: { angle: number; z: number }[] = [],
    points: Vector[] = [],
    triangles: number[][] = [];
  const keys = new Map<string, number>();
  for (const face of faces)
    for (let i = 0; i < face.vertices.length; i += 9) {
      const indexes = [0, 3, 6].map((offset) => {
        const point = face.vertices.slice(i + offset, i + offset + 3) as Vector;
        const key = point.map((v) => Math.round(v * 1e7)).join(",");
        let index = keys.get(key);
        if (index === undefined) {
          index = coords.length;
          keys.set(key, index);
          points.push(point);
          coords.push(cylinderCoordinates(frame, point));
        }
        return index;
      });
      if (new Set(indexes).size !== 3) continue;
      const [a, b, c] = indexes.map((n) => points[n]);
      const radial = subtract(a, cylinderPoint(frame, 0, coords[indexes[0]].z, 0));
      if (dot(cross(subtract(b, a), subtract(c, a)), radial) < 0) indexes.reverse();
      triangles.push(indexes);
    }
  return radialShell(
    frame,
    coords,
    triangles,
    () => low,
    () => high,
  );
}

export function cylinderGrid(segments: number, steps: number, bounds: [number, number]) {
  const coords: { angle: number; z: number }[] = [],
    triangles: number[][] = [];
  for (let row = 0; row <= steps; row++)
    for (let col = 0; col < segments; col++)
      coords.push({
        angle: (2 * Math.PI * col) / segments,
        z: bounds[0] + ((bounds[1] - bounds[0]) * row) / steps,
      });
  for (let row = 0; row < steps; row++)
    for (let col = 0; col < segments; col++) {
      const a = row * segments + col,
        b = row * segments + ((col + 1) % segments);
      triangles.push([a, b, a + segments], [b, b + segments, a + segments]);
    }
  return { coords, triangles };
}
