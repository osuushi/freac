import { strToU8, zipSync } from "three/addons/libs/fflate.module.js";
import type { Body } from "./body.js";
import { type ExportMesh, exportMesh, triangleNormal } from "./export-mesh.js";

export type ExportFormat = "stl" | "3mf";
export function exportBodies(
  bodies: readonly Body[],
  format: ExportFormat,
): Uint8Array<ArrayBuffer> {
  if (!bodies.length) throw new Error("Create a solid body before exporting");
  const meshes = bodies.map(exportMesh);
  return format === "stl" ? stl(meshes) : threeMF(meshes);
}

function stl(meshes: ExportMesh[]): Uint8Array<ArrayBuffer> {
  const count = meshes.reduce((sum, mesh) => sum + mesh.triangles.length, 0);
  const bytes = new Uint8Array(84 + 50 * count),
    view = new DataView(bytes.buffer);
  bytes.set(new TextEncoder().encode("Freac binary STL; coordinates in millimeters"));
  view.setUint32(80, count, true);
  let offset = 84;
  for (const mesh of meshes)
    for (const triangle of mesh.triangles) {
      const points = triangle.map((index) => mesh.vertices[index].map(Math.fround));
      if (!points.flat().every(Number.isFinite))
        throw new Error("Coordinates exceed STL precision");
      // Validate after conversion too: binary STL stores only float32 coordinates.
      for (const value of [...triangleNormal(points), ...points.flat()]) {
        view.setFloat32(offset, value, true);
        offset += 4;
      }
      offset += 2;
    }
  return bytes;
}

function threeMF(meshes: ExportMesh[]): Uint8Array<ArrayBuffer> {
  const objects = meshes
    .map((mesh, index) => {
      const vertices = mesh.vertices
        .map(([x, y, z]) => `<vertex x="${x}" y="${y}" z="${z}"/>`)
        .join("");
      const triangles = mesh.triangles
        .map(([v1, v2, v3]) => `<triangle v1="${v1}" v2="${v2}" v3="${v3}"/>`)
        .join("");
      return `<object id="${index + 1}" type="model" name="Body ${index + 1}"><mesh><vertices>${vertices}</vertices><triangles>${triangles}</triangles></mesh></object>`;
    })
    .join("");
  const build = meshes.map((_, index) => `<item objectid="${index + 1}"/>`).join("");
  const xml = '<?xml version="1.0" encoding="UTF-8"?>';
  // Core OPC package; no slicer-specific project settings or required extensions.
  return new Uint8Array(
    zipSync({
      "[Content_Types].xml": strToU8(
        `${xml}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="model" ContentType="application/vnd.ms-package.3dmanufacturing-3dmodel+xml"/></Types>`,
      ),
      "_rels/.rels": strToU8(
        `${xml}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Target="/3D/3dmodel.model" Id="model" Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel"/></Relationships>`,
      ),
      "3D/3dmodel.model": strToU8(
        `${xml}<model unit="millimeter" xml:lang="en-US" xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02"><resources>${objects}</resources><build>${build}</build></model>`,
      ),
    }),
  );
}
