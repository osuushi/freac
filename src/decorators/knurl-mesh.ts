import type { Face } from "../model/body.js";
import type { PlaneFrame } from "../sketch/planes.js";
import { cylinderExtent } from "./cylinder.js";
import { knurlGrid, knurlWave } from "./knurl-grid.js";
import { type KnurlSettings, knurlDimensions } from "./knurl-settings.js";
import { cylinderGrid, faceMask, radialShell } from "./radial-mesh.js";

export function knurlRadius(
  radius: number,
  angle: number,
  z: number,
  settings: KnurlSettings,
  outward: number,
): number {
  const { repeats, pitch } = knurlDimensions(radius, settings);
  const around = (repeats * angle) / (2 * Math.PI);
  const height =
    Math.min(0.65, knurlWave(z / pitch + around), knurlWave(z / pitch - around)) / 0.65;
  return radius + outward * settings.depth * (settings.mode === "raised" ? height : height - 1);
}

export function knurlMeshes(
  frame: PlaneFrame,
  faces: readonly Face[],
  settings: KnurlSettings,
  quality: "preview" | "export",
) {
  const cylinder = faces[0].cylinder;
  if (!cylinder) throw new Error("Knurling requires cylindrical faces");
  const { radius, outward } = cylinder;
  const bounds = cylinderExtent(frame, faces);
  const { repeats, pitch } = knurlDimensions(radius, settings);
  const tolerance = quality === "export" ? 0.004 : 0.025;
  const low = radius - settings.depth - 0.02,
    high = radius + settings.depth + 0.02;
  if (low <= 0) throw new Error("Knurl depth is too large for this cylinder");
  const segments = Math.max(
    48,
    Math.ceil(Math.PI / Math.acos(1 - tolerance / high)),
    repeats * (quality === "export" ? 24 : 8),
  );
  const steps = Math.max(
    1,
    Math.ceil(((bounds[1] - bounds[0]) / pitch) * (quality === "export" ? 12 : 4)),
  );
  if (segments * steps > 100_000)
    throw new Error("Knurling exceeds the mesh budget; increase spacing or reduce coverage");
  const grid = knurlGrid(segments, steps, bounds, repeats, pitch);
  const bandGrid = cylinderGrid(segments, 1, bounds);
  const ring = (a: number, b: number) =>
    radialShell(
      frame,
      bandGrid.coords,
      bandGrid.triangles,
      () => a,
      () => b,
    );
  const target = (a: number, z: number) => knurlRadius(radius, a, z, settings, outward);
  const radialSign = outward * (settings.mode === "raised" ? 1 : -1);
  const reference = () => radius - radialSign * 2 * tolerance;
  const direct = {
    operation: settings.mode === "raised" ? ("add" as const) : ("subtract" as const),
    mesh: radialShell(
      frame,
      grid.coords,
      grid.triangles,
      radialSign > 0 ? reference : target,
      radialSign > 0 ? target : reference,
    ),
  };
  const area = faces.reduce((sum, face) => sum + face.signature[2], 0);
  const complete = Math.abs(area - 2 * Math.PI * radius * (bounds[1] - bounds[0])) < 1e-6;
  return {
    tolerance,
    direct,
    band: ring(low, high),
    masks: complete ? null : faces.map((face) => faceMask(frame, [face], low, high)),
    fill: radialShell(
      frame,
      grid.coords,
      grid.triangles,
      outward > 0 ? () => low : target,
      outward > 0 ? target : () => high,
    ),
  };
}
