import { type Point, split as splitPolygon } from "./thread-grid.js";

function split(polygon: Point[], level: number, phase: (p: Point) => number): Point[][] {
  const snapped = (p: Point) => {
    const value = phase(p);
    return Math.abs(value - level) < 1e-10 ? level : value;
  };
  if (polygon.every((p) => snapped(p) === level)) return [polygon];
  return splitPolygon(polygon, level, snapped);
}

const tau = 2 * Math.PI;
export function knurlWave(phase: number): number {
  return 1 - Math.abs(2 * (phase - Math.floor(phase)) - 1);
}
/** Split both helices, their intersection and the flat tops before triangulation. */
function patches(polygon: Point[], repeats: number, pitch: number): Point[][] {
  const phases = [
    (p: Point) => p.z / pitch + (repeats * p.angle) / tau,
    (p: Point) => p.z / pitch - (repeats * p.angle) / tau,
  ];
  let result = [polygon];
  for (const phase of phases) {
    const values = polygon.map(phase);
    const low = Math.min(...values),
      high = Math.max(...values);
    for (let half = Math.ceil(low * 2); half < high * 2 - 1e-10; half++) {
      if (half / 2 <= low + 1e-10) continue;
      result = result.flatMap((p) => split(p, half / 2, phase));
    }
  }
  result = result.flatMap((p) =>
    split(p, 0, (q) => knurlWave(phases[0](q)) - knurlWave(phases[1](q))),
  );
  return result.flatMap((p) =>
    split(p, 0.65, (q) => Math.min(...phases.map((phase) => knurlWave(phase(q))))),
  );
}
export function knurlGrid(
  segments: number,
  steps: number,
  bounds: [number, number],
  repeats: number,
  pitch: number,
) {
  const coords: Point[] = [],
    triangles: number[][] = [];
  const indexes = new Map<string, number>();
  const index = (point: Point) => {
    const angle = Math.abs(point.angle - tau) < 1e-10 ? 0 : point.angle;
    const key = `${Math.round(angle * 1e10)}/${Math.round(point.z * 1e10)}`;
    let id = indexes.get(key);
    if (id === undefined) {
      id = coords.length;
      indexes.set(key, id);
      coords.push({ angle, z: point.z });
    }
    return id;
  };
  for (let row = 0; row < steps; row++) {
    const low = bounds[0] + ((bounds[1] - bounds[0]) * row) / steps;
    const high = bounds[0] + ((bounds[1] - bounds[0]) * (row + 1)) / steps;
    for (let col = 0; col < segments; col++) {
      const a = (tau * col) / segments,
        b = (tau * (col + 1)) / segments;
      for (const patch of patches(
        [
          { angle: a, z: low },
          { angle: b, z: low },
          { angle: b, z: high },
          { angle: a, z: high },
        ],
        repeats,
        pitch,
      )) {
        const ids = patch
          .map(index)
          .filter((id, i, all) => id !== all[(i + all.length - 1) % all.length]);
        for (let i = 1; i < ids.length - 1; i++) {
          const [p, q, r] = [ids[0], ids[i], ids[i + 1]].map((id) => coords[id]);
          // Use unwrapped coordinates for the seam cell's parameter area.
          const x = (p: Point) => (col === segments - 1 && p.angle === 0 ? tau : p.angle);
          const area = (x(q) - x(p)) * (r.z - p.z) - (x(r) - x(p)) * (q.z - p.z);
          if (area > 1e-16) triangles.push([ids[0], ids[i], ids[i + 1]]);
        }
      }
    }
  }
  return { coords, triangles };
}
