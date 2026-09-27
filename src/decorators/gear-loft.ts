import { ShapeUtils, Vector2 } from "three";
import type { ExportMesh } from "../model/export-mesh.js";
import type { PlaneFrame } from "../sketch/planes.js";
import { cylinderPoint } from "./cylinder.js";
import type { GearProfilePoint } from "./gear-profile.js";

export function profileShell(
  frame: PlaneFrame,
  profile: GearProfilePoint[],
  bounds: [number, number],
  steps: number,
  twist: number,
  phase: number,
  scale = (_z: number) => 1,
): ExportMesh {
  const vertices: number[][] = [],
    triangles: number[][] = [];
  const count = profile.length;
  for (let row = 0; row <= steps; row++) {
    const z = bounds[0] + ((bounds[1] - bounds[0]) * row) / steps;
    for (const p of profile)
      vertices.push(cylinderPoint(frame, p.angle + twist * z + phase, z, p.radius * scale(z)));
  }
  for (let row = 0; row < steps; row++)
    for (let col = 0; col < count; col++) {
      const a = row * count + col,
        b = row * count + ((col + 1) % count);
      triangles.push([a, b, a + count], [b, b + count, a + count]);
    }
  const caps = ShapeUtils.triangulateShape(
    profile.map((p) => new Vector2(p.radius * Math.cos(p.angle), p.radius * Math.sin(p.angle))),
    [],
  );
  for (const [a, b, c] of caps)
    triangles.push([c, b, a], [a + count * steps, b + count * steps, c + count * steps]);
  return { vertices, triangles };
}
