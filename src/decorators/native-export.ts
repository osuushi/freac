import { type ExportMesh, exportMesh } from "../model/export-mesh.js";
import type { ExportTiming } from "../model/export-timing.js";
import { decodeNativeMesh, encodeMeshPlan } from "../model/mesh-wire.js";
import type { SketchDocument } from "../sketch/document.js";
import { decoratedBody } from "./export-body.js";
import type { JavaScriptDecorators } from "./javascript-hooks.js";
import { MeshPlan } from "./mesh-plan.js";
import { exportTolerance } from "./precision.js";

export async function nativeDecoratedMeshes(
  document: SketchDocument,
  integrate: (input: ArrayBuffer) => Promise<ArrayBuffer>,
  javascript?: JavaScriptDecorators,
  timing?: ExportTiming,
): Promise<ExportMesh[]> {
  const meshes: ExportMesh[] = [];
  for (const body of document.bodies ?? []) {
    const instances = (document.decorators ?? []).filter((d) =>
      d.faces.some((f) => f.body === body.id),
    );
    if (!instances.length) {
      meshes.push(exportMesh(body));
      continue;
    }
    try {
      const scope = new MeshPlan(body.center);
      const precision = exportTolerance(instances, document) / 4;
      const solid = decoratedBody(scope, document, body, instances, javascript, timing);
      timing?.mark("geometry");
      const input = encodeMeshPlan(scope, solid.index, precision);
      timing?.mark("wireEncode");
      const output = await integrate(input);
      timing?.mark("nativeRoundTrip");
      meshes.push(decodeNativeMesh(output, body.center, precision, timing));
    } catch (error) {
      throw new Error(
        `Decorated body ${body.id}, ${instances.map((d) => `${d.definition} (${d.id})`).join(", ")}: ${error instanceof Error ? error.message : error}`,
      );
    }
  }
  return meshes;
}
