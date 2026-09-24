import type { Face } from "../model/body.js";
import type { ExportMesh } from "../model/export-mesh.js";
import type { PlaneFrame, Vector } from "../sketch/planes.js";
import {
  cross,
  cylinderCoordinates,
  cylinderExtent,
  cylinderPoint,
  dot,
  subtract,
} from "./cylinder.js";
import type { ThreadSettings } from "./thread-settings.js";

/** The same radial envelope defines both mating surfaces; only the hole gets relief. */
export function threadRadius(
  radius: number,
  angle: number,
  z: number,
  settings: ThreadSettings,
  outward: 1 | -1,
  bounds: [number, number],
): number {
  const turns = z / settings.pitch - ((settings.hand === "right" ? 1 : -1) * angle) / (2 * Math.PI);
  const phase = turns - Math.floor(turns);
  const triangle = 1 - Math.abs(2 * phase - 1);
  const profile =
    settings.profile === "rounded"
      ? (1 - Math.cos(2 * Math.PI * phase)) / 2
      : Math.min(1, Math.max(0, (triangle - 0.125) / 0.625));
  const taper = Math.max(
    0,
    Math.min(
      1,
      settings.startTaper ? (z - bounds[0]) / settings.startTaper : 1,
      settings.endTaper ? (bounds[1] - z) / settings.endTaper : 1,
    ),
  );
  // Truncated 60° profile: radial depth = 5/8 of the fundamental triangle height.
  const depth = (settings.pitch * Math.sqrt(3) * 5) / 16;
  return (
    radius +
    (settings.cut === "rod" ? -1 : 1) * depth * profile * taper +
    (outward < 0 ? settings.clearance : 0)
  );
}

/** Close the two radial skins using only boundary edges of the shared parameter mesh. */
function radialShell(
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
function faceMask(frame: PlaneFrame, faces: readonly Face[], low: number, high: number) {
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

function cylinderGrid(segments: number, steps: number, bounds: [number, number]) {
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

export function threadMeshes(
  frame: PlaneFrame,
  faces: readonly Face[],
  settings: ThreadSettings,
  quality: "preview" | "export" = "export",
) {
  const cylinder = faces[0].cylinder;
  if (!cylinder) throw new Error("Threads require cylindrical faces");
  const extent = cylinderExtent(frame, faces);
  const bounds: [number, number] = [extent[0] + settings.start, extent[1] - settings.end];
  if (bounds[1] <= bounds[0]) throw new Error("Thread insets leave no threaded length");
  const depth = settings.pitch * 0.62;
  const low = cylinder.radius - depth - 0.02,
    high = cylinder.radius + depth + settings.clearance + 0.02;
  if (low <= 0) throw new Error("Thread pitch is too large for this cylinder");
  const tolerance = quality === "preview" ? 0.08 : 0.008;
  const segments = Math.max(
    32,
    Math.ceil(Math.PI / Math.acos(1 - Math.min(0.1, tolerance / high))),
  );
  const steps = Math.max(
    1,
    Math.ceil(((bounds[1] - bounds[0]) / settings.pitch) * (quality === "preview" ? 12 : 32)),
  );
  if (steps * segments > 1_000_000)
    throw new Error("Threads exceed the mesh budget; increase pitch or reduce length");
  const { coords, triangles } = cylinderGrid(segments, steps, bounds);
  const bandGrid = cylinderGrid(segments, 1, bounds);
  const area = faces.reduce((sum, face) => sum + face.signature[2], 0);
  const complete = Math.abs(area - 2 * Math.PI * cylinder.radius * (extent[1] - extent[0])) < 1e-6;
  const target = (angle: number, z: number) =>
    threadRadius(cylinder.radius, angle, z, settings, cylinder.outward, bounds);
  return {
    mask: complete ? null : faceMask(frame, faces, low, high),
    band: radialShell(
      frame,
      bandGrid.coords,
      bandGrid.triangles,
      () => low,
      () => high,
    ),
    fill: radialShell(
      frame,
      coords,
      triangles,
      cylinder.outward > 0 ? () => low : target,
      cylinder.outward > 0 ? target : () => high,
    ),
  };
}
