import type { Face } from "../model/body.js";
import type { ExportMesh } from "../model/export-mesh.js";
import type { PlaneFrame, Vector } from "../sketch/planes.js";
import {
  type Cylinder,
  cross,
  cylinderCoordinates,
  cylinderExtent,
  cylinderPoint,
  dot,
  subtract,
} from "./cylinder.js";
import { surfaceShell } from "./surface-shell.js";
import { threadGrid } from "./thread-grid.js";
import { type ThreadPreviewResolution, threadSampling } from "./thread-sampling.js";
import { type ThreadSettings, threadDepth } from "./thread-settings.js";

/** Clip the rod crest and open the matching hole groove without adding material. */
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
  const depth = threadDepth(settings);
  const clippedTip = settings.profile === "triangle" ? settings.tipTruncation / depth : 0;
  const crest = settings.cut === "rod" ? 1 - triangle : triangle;
  const relievedCrest =
    outward > 0 ? Math.min(1 - clippedTip, crest) : Math.min(1, crest / (1 - clippedTip));
  const profile =
    settings.profile === "rounded"
      ? (1 - Math.cos(2 * Math.PI * phase)) / 2
      : settings.profile === "triangle"
        ? settings.cut === "rod"
          ? 1 - relievedCrest
          : relievedCrest
        : Math.min(1, Math.max(0, (triangle - 0.125) / 0.625));
  const taper = Math.max(
    0,
    Math.min(
      1,
      settings.startTaper ? (z - bounds[0]) / settings.startTaper : 1,
      settings.endTaper ? (bounds[1] - z) / settings.endTaper : 1,
    ),
  );
  return (
    radius +
    (settings.cut === "rod" ? -1 : 1) * depth * profile * taper +
    (outward < 0 ? settings.clearance : 0)
  );
}

/** Close the two radial skins using only boundary edges of the shared parameter mesh. */
export function radialShell(
  frame: PlaneFrame,
  coordinates: { angle: number; z: number }[],
  triangles: number[][],
  inner: (a: number, z: number) => number,
  outer: (a: number, z: number) => number,
): ExportMesh {
  const points = (radius: (a: number, z: number) => number) =>
    coordinates.map(({ angle, z }) => cylinderPoint(frame, angle, z, radius(angle, z)));
  return surfaceShell(points(inner), points(outer), triangles);
}

/** Radial sweep of the selected tessellated face domains, preserving holes and gaps. */
export function faceMask(
  frame: PlaneFrame,
  faces: readonly Face[],
  low: number | ((z: number) => number),
  high: number | ((z: number) => number),
) {
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
    (_, z) => (typeof low === "number" ? low : low(z)),
    (_, z) => (typeof high === "number" ? high : high(z)),
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

function threadToolMeshes(
  frame: PlaneFrame,
  grid: ReturnType<typeof cylinderGrid>,
  cylinder: Cylinder,
  settings: ThreadSettings,
  low: number,
  high: number,
  tolerance: number,
) {
  const { radius, outward } = cylinder;
  const depth = threadDepth(settings);
  // Two tolerances can leave overlapping exit facets after the Boolean; four
  // keeps auxiliary reference skins clear of the target at thread runout.
  const overlap = Math.min(4 * tolerance, low / 2);
  const relief = outward < 0 ? settings.clearance : 0;
  const minimum = radius + (settings.cut === "rod" ? -depth : 0) + relief;
  const maximum = radius + (settings.cut === "hole" ? depth : 0) + relief;
  const ring = (a: number, b: number) =>
    radialShell(
      frame,
      grid.coords,
      grid.triangles,
      () => a,
      () => b,
    );
  const reference = (offset: number) =>
    ring(outward > 0 ? low : radius - offset, outward > 0 ? radius + offset : high);
  return {
    hasAdd: outward > 0 ? maximum > radius : minimum < radius,
    hasRemove: outward > 0 ? minimum < radius : maximum > radius,
    band: ring(low, high),
    // Reference overlap compensates base tessellation, without changing the target profile.
    referenceRemove: reference(overlap),
    referenceAdd: reference(-overlap),
    // The physical envelope excludes numerical slivers on the auxiliary radial skins.
    removeBand:
      outward > 0
        ? ring(Math.min(radius, minimum) - overlap, radius + overlap)
        : ring(radius - overlap, Math.max(radius, maximum) + overlap),
    addBand:
      outward > 0
        ? ring(radius - overlap, Math.max(radius, maximum) + overlap)
        : ring(Math.min(radius, minimum) - overlap, radius + overlap),
  };
}

/** Pure addition/removal modes can emit their differential shell directly. */
function directOperand(
  frame: PlaneFrame,
  grid: ReturnType<typeof cylinderGrid>,
  cylinder: Cylinder,
  settings: ThreadSettings,
  overlap: number,
  target: (angle: number, z: number) => number,
) {
  if (cylinder.outward < 0 && settings.cut === "rod") return null;
  const remove = settings.cut === "rod" || cylinder.outward < 0;
  return {
    operation: remove ? ("subtract" as const) : ("add" as const),
    mesh: radialShell(
      frame,
      grid.coords,
      grid.triangles,
      settings.cut === "rod" ? target : () => cylinder.radius - overlap,
      settings.cut === "rod" ? () => cylinder.radius + overlap : target,
    ),
  };
}

export function threadMeshes(
  frame: PlaneFrame,
  faces: readonly Face[],
  settings: ThreadSettings,
  quality: "preview" | "export" = "export",
  reference?: [number, number],
  previewResolution?: ThreadPreviewResolution,
) {
  const cylinder = faces[0].cylinder;
  if (!cylinder) throw new Error("Threads require cylindrical faces");
  const extent = cylinderExtent(frame, faces);
  const axial = reference ?? extent;
  const taperBounds: [number, number] = [axial[0] + settings.start, axial[1] - settings.end];
  if (taperBounds[1] <= taperBounds[0]) throw new Error("Thread insets leave no threaded length");
  const bounds: [number, number] = [
    Math.max(extent[0], taperBounds[0]),
    Math.min(extent[1], taperBounds[1]),
  ];
  if (bounds[1] <= bounds[0] + 1e-7) return null;
  const depth = threadDepth(settings);
  const low = cylinder.radius - depth - 0.02,
    high = cylinder.radius + depth + settings.clearance + 0.02;
  if (low <= 0) throw new Error("Thread profile is too deep for this cylinder");
  const { tolerance, segments, samples } = threadSampling(
    settings,
    depth,
    high,
    quality,
    previewResolution,
  );
  const steps = Math.max(1, Math.ceil(((bounds[1] - bounds[0]) / settings.pitch) * samples));
  if (steps * segments > 1_000_000)
    throw new Error("Threads exceed the mesh budget; increase pitch or reduce length");
  const { coords, triangles } = threadGrid(segments, steps, bounds, settings, taperBounds);
  const bandGrid = cylinderGrid(segments, 1, bounds);
  const area = faces.reduce((sum, face) => sum + face.signature[2], 0);
  const complete = Math.abs(area - 2 * Math.PI * cylinder.radius * (extent[1] - extent[0])) < 1e-6;
  const target = (angle: number, z: number) =>
    threadRadius(cylinder.radius, angle, z, settings, cylinder.outward, taperBounds);
  // Auxiliary skins must share the band's polygon, including inserted profile vertices.
  // Otherwise differing circle tessellations leave remote slivers in a difference.
  const polygonRadius = (radius: number, angle: number) => {
    const step = (2 * Math.PI) / segments;
    const middle = (Math.floor(angle / step) + 0.5) * step;
    return (radius * Math.cos(step / 2)) / Math.cos(angle - middle);
  };
  return {
    resolution: { segments, samples },
    ...threadToolMeshes(frame, bandGrid, cylinder, settings, low, high, tolerance),
    tolerance,
    masks: complete ? null : faces.map((face) => faceMask(frame, [face], low, high)),
    get direct() {
      return directOperand(
        frame,
        { coords, triangles },
        cylinder,
        settings,
        Math.min(2 * tolerance, low / 2),
        target,
      );
    },
    get fill() {
      return radialShell(
        frame,
        coords,
        triangles,
        cylinder.outward > 0 ? (angle) => polygonRadius(low, angle) : target,
        cylinder.outward > 0 ? target : (angle) => polygonRadius(high, angle),
      );
    },
  };
}
