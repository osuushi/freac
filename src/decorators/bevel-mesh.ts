import type { SketchDocument } from "../sketch/document.js";
import { bevelProfile } from "./bevel-profile.js";
import { cylinderExtent } from "./cylinder.js";
import { gearFaces } from "./gear-faces.js";
import { profileShell } from "./gear-loft.js";
import { gearTolerance } from "./gear-precision.js";
import { gearSettings, radians } from "./gear-settings.js";
import { cylinderGrid, faceMask, radialShell } from "./thread-mesh.js";
import type { DecoratorInstance } from "./types.js";

export function bevelMeshes(
  document: SketchDocument,
  instance: DecoratorInstance,
  quality: "preview" | "export",
) {
  const faces = gearFaces(document, instance.faces),
    cone = faces[0].cone;
  const body = document.bodies?.find((b) => b.id === instance.faces[0].body);
  if (!body || !cone) throw new Error("Missing bevel gear support");
  const bounds = cylinderExtent(instance.frame, faces),
    settings = gearSettings(instance.settings);
  const tolerance = gearTolerance(document, instance, quality);
  const profile = bevelProfile(
    cone,
    settings,
    tolerance / 4,
    bounds[1],
    instance.axialReference?.[1],
  );
  const low = (z: number) => z * profile.low - tolerance * 8;
  const high = (z: number) => z * profile.high + tolerance * 8;
  if (low(bounds[0]) <= 0)
    throw new Error("Bevel teeth are too close to the apex for mesh precision");
  const segments = Math.max(
    64,
    Math.ceil(Math.PI / Math.acos(1 - tolerance / (2 * high(bounds[1])))),
  );
  if (segments > 100_000 || profile.profile.length > 200_000)
    throw new Error("Bevel gear exceeds the mesh budget");
  const grid = cylinderGrid(segments, 1, bounds);
  const ring = (a: (z: number) => number, b: (z: number) => number) =>
    radialShell(
      instance.frame,
      grid.coords,
      grid.triangles,
      (_, z) => a(z),
      (_, z) => b(z),
    );
  const reference = (offset: number) =>
    cone.outward > 0
      ? ring(low, (z) => z * profile.pitch + offset)
      : ring((z) => z * profile.pitch - offset, high);
  return {
    faces,
    body,
    geometry: {
      tolerance,
      outward: cone.outward,
      band: ring(low, high),
      masks: faces.map((face) => faceMask(instance.frame, [face], low, high)),
      fill: profileShell(
        instance.frame,
        profile.profile,
        bounds,
        1,
        0,
        radians(settings.phase),
        (z) => z,
      ),
      referenceRemove: reference(tolerance * 4),
      referenceAdd: reference(-tolerance * 4),
      envelope: ring(
        (z) => low(z) + tolerance * 4,
        (z) => high(z) - tolerance * 4,
      ),
    },
  };
}
