import type { Face } from "../model/body.js";
import type { DisplayDocument } from "../model/display-document.js";
import type { Vector } from "../sketch/planes.js";
import { cross, dot, subtract } from "./cylinder.js";
import { gearFaces } from "./gear-faces.js";
import { gearTolerance } from "./gear-precision.js";
import { type GearSettings, gearSettings, radians } from "./gear-settings.js";
import { surfaceShell } from "./surface-shell.js";
import type { DecoratorInstance } from "./types.js";

export function rackMeshes(
  document: DisplayDocument,
  instance: DecoratorInstance,
  quality: "preview" | "export",
) {
  const faces = gearFaces(document, instance.faces);
  const body = document.bodies?.find((b) => b.id === instance.faces[0].body);
  if (!body) throw new Error("Rack body is missing");
  const settings = gearSettings(instance.settings),
    frame = instance.frame;
  const angle = radians(settings.direction),
    beta = radians(settings.helix);
  const u = frame.u.map((v, i) => Math.cos(angle) * v + Math.sin(angle) * frame.v[i]) as Vector;
  const v = frame.v.map((n, i) => Math.cos(angle) * n - Math.sin(angle) * frame.u[i]) as Vector;
  const normal = cross(u, v),
    slope = (settings.hand === "right" ? 1 : -1) * Math.tan(beta);
  const local = (p: Vector) => {
    const d = subtract(p, frame.origin);
    return [dot(d, u), dot(d, v)];
  };
  const point = (x: number, y: number, z: number) =>
    frame.origin.map((n, i) => n + x * u[i] + y * v[i] + z * normal[i]);
  const coordinates = faces.flatMap((face) =>
    face.vertices.flatMap((_, i) =>
      i % 3 ? [] : [local(face.vertices.slice(i, i + 3) as Vector)],
    ),
  );
  const [minX, maxX, minY, maxY] = coordinates.reduce(
    ([x0, x1, y0, y1], [x, y]) => [
      Math.min(x0, x - slope * y),
      Math.max(x1, x - slope * y),
      Math.min(y0, y),
      Math.max(y1, y),
    ],
    [Infinity, -Infinity, Infinity, -Infinity],
  );
  const { tip, root, samples } = rackProfile(settings, beta, minX, maxX);
  const tolerance = gearTolerance(document, instance, quality);
  const low = root - tolerance * 8,
    high = tip + tolerance * 8;
  const grid = [minY, maxY].flatMap((y) => samples.map(({ x, z }) => ({ x: x + slope * y, y, z })));
  const triangles: number[][] = [];
  const n = samples.length;
  for (let i = 0; i < n - 1; i++) triangles.push([i, i + 1, i + n], [i + 1, i + n + 1, i + n]);
  const slab = (bottom: number, top: number) =>
    surfaceShell(
      grid.map((p) => point(p.x, p.y, bottom)),
      grid.map((p) => point(p.x, p.y, top)),
      triangles,
    );

  return {
    faces,
    body,
    geometry: {
      tolerance,
      outward: 1 as const,
      band: slab(low, high),
      masks: faces.map((face) => rackMask(face, local, point, low, high)),
      fill: surfaceShell(
        grid.map((p) => point(p.x, p.y, low)),
        grid.map((p) => point(p.x, p.y, p.z)),
        triangles,
      ),
      referenceRemove: slab(low, tolerance * 4),
      referenceAdd: slab(low, -tolerance * 4),
      envelope: slab(low + tolerance * 4, high - tolerance * 4),
    },
  };
}

function rackMask(
  face: Face,
  local: (p: Vector) => number[],
  point: (x: number, y: number, z: number) => number[],
  low: number,
  high: number,
) {
  const indexes = new Map<string, number>(),
    points: number[][] = [],
    tris: number[][] = [];
  for (let i = 0; i < face.vertices.length; i += 9) {
    const ids = [0, 3, 6].map((offset) => {
      const xy = local(face.vertices.slice(i + offset, i + offset + 3) as Vector);
      const key = xy.map((n) => Math.round(n * 1e7)).join("/");
      let id = indexes.get(key);
      if (id === undefined) {
        id = points.length;
        indexes.set(key, id);
        points.push(xy);
      }
      return id;
    });
    tris.push(ids);
  }
  return surfaceShell(
    points.map(([x, y]) => point(x, y, low)),
    points.map(([x, y]) => point(x, y, high)),
    tris,
  );
}

function rackProfile(settings: GearSettings, beta: number, minX: number, maxX: number) {
  const module = settings.module,
    pitch = (Math.PI * module) / Math.cos(beta);
  const tip = module * (1 + settings.shift),
    root = -module * (1 + settings.clearance - settings.shift);
  const half =
    ((Math.PI * module) / 4 +
      settings.shift * module * Math.tan(radians(settings.pressure)) -
      settings.thinning / 2) /
    Math.cos(beta);
  const flank = Math.tan(radians(settings.pressure)) / Math.cos(beta);
  const tipWidth = half - tip * flank,
    rootWidth = half - root * flank;
  const phase = settings.rackPhase;
  const samples: { x: number; z: number }[] = [];
  const start = Math.floor((minX - phase) / pitch) - 1,
    end = Math.ceil((maxX - phase) / pitch) + 1;
  if (end - start > 10000) throw new Error("Rack exceeds the tooth budget; increase module");
  for (let tooth = start; tooth <= end; tooth++)
    for (const [x, z] of [
      [-rootWidth, root],
      [-tipWidth, tip],
      [tipWidth, tip],
      [rootWidth, root],
    ])
      samples.push({ x: tooth * pitch + phase + x, z });
  return { tip, root, samples };
}
