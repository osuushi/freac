import type { Body } from "./body.js";
import { type ExportMesh, validateMesh } from "./export-mesh.js";

/** Temporary export data from one accepted snapshot; never part of the document. */
export type StepItem = { brep: string } | { mesh: ExportMesh };

export function stepItems(
  bodies: readonly Body[],
  meshes?: readonly (ExportMesh | undefined)[],
): StepItem[] {
  if (!bodies.length) throw new Error("Create or show a solid body first");
  if (meshes && meshes.length !== bodies.length) throw new Error("Export mesh body count changed");
  return bodies.map((body, index) => {
    const mesh = meshes?.[index];
    return mesh ? { mesh } : { brep: body.brep };
  });
}

export function validateStepItems(items: readonly StepItem[]): void {
  if (!items.length) throw new Error("Create or show a solid body first");
  for (const item of items) {
    if ("brep" in item) {
      if (typeof item.brep !== "string" || !/^(?:[0-9a-f]{2})+$/.test(item.brep))
        throw new Error("Invalid exact-shape encoding");
      continue;
    }
    if (!item.mesh || !Array.isArray(item.mesh.vertices) || !Array.isArray(item.mesh.triangles))
      throw new Error("Invalid STEP mesh");
    for (const point of item.mesh.vertices)
      if (!Array.isArray(point) || point.length !== 3 || !point.every(Number.isFinite))
        throw new Error("Mesh contains invalid coordinates");
    for (const triangle of item.mesh.triangles)
      if (
        !Array.isArray(triangle) ||
        triangle.length !== 3 ||
        triangle.some((i) => !Number.isInteger(i) || i < 0 || i >= item.mesh.vertices.length)
      )
        throw new Error("Invalid STEP mesh triangle");
    validateMesh(item.mesh);
  }
}
