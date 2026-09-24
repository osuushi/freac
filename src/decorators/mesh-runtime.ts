import Module, { type ManifoldToplevel } from "manifold-3d";
import { type ExportMesh, exportMesh } from "../model/export-mesh.js";
import type { SketchDocument } from "../sketch/document.js";
import { resolveFaces } from "./cylinder.js";
import { validateThread } from "./edits.js";
import { MeshScope } from "./mesh-scope.js";
import { exportTolerance } from "./precision.js";
import { threadDomain } from "./thread-domain.js";
import { threadMeshes } from "./thread-mesh.js";
import { threadDefinition, threadSettings } from "./thread-settings.js";
import type { DecoratorInstance } from "./types.js";

export async function initializeMeshRuntime(wasmUrl?: string): Promise<ManifoldToplevel> {
  const runtime = await Module(wasmUrl ? { locateFile: () => wasmUrl } : undefined);
  runtime.setup();
  return runtime;
}

function threadOperands(
  scope: MeshScope,
  document: SketchDocument,
  instance: DecoratorInstance,
  quality: "preview" | "export",
) {
  if (instance.problem) throw new Error(instance.problem);
  if (instance.definition !== threadDefinition || instance.version !== 1)
    throw new Error(`Unavailable decorator: ${instance.definition} v${instance.version}`);
  validateThread(document, instance);
  const faces = resolveFaces(document.bodies ?? [], instance.faces);
  const body = document.bodies?.find((b) => b.id === instance.faces[0].body);
  if (!body) throw new Error("Thread body is missing");
  const geometry = threadMeshes(
    instance.frame,
    faces,
    threadSettings(instance.settings),
    quality,
    instance.axialReference,
  );
  if (!geometry) return null;
  const mask = geometry.masks ? threadDomain(scope, body, faces, geometry) : null;
  const generated = scope.from(geometry.fill);
  return { mask, generated, geometry };
}

export function decoratedMeshes(runtime: ManifoldToplevel, document: SketchDocument): ExportMesh[] {
  return (document.bodies ?? []).map((body) => {
    const instances = (document.decorators ?? []).filter((d) =>
      d.faces.some((f) => f.body === body.id),
    );
    if (!instances.length) return exportMesh(body);
    const scope = new MeshScope(runtime, body.center, exportTolerance(instances) / 4);
    try {
      let solid = scope.from(exportMesh(body));
      for (const instance of instances) {
        const operands = threadOperands(scope, document, instance, "export");
        if (!operands) continue;
        const { mask, generated, geometry } = operands;
        if (geometry.hasRemove) {
          let remove = scope.keep(scope.from(geometry.referenceRemove).subtract(generated));
          remove = scope.keep(remove.intersect(scope.from(geometry.removeBand)));
          if (mask) remove = scope.keep(remove.intersect(mask));
          if (!remove.isEmpty()) solid = scope.keep(solid.subtract(remove));
        }
        if (geometry.hasAdd) {
          let add = scope.keep(generated.subtract(scope.from(geometry.referenceAdd)));
          add = scope.keep(add.intersect(scope.from(geometry.addBand)));
          if (mask) add = scope.keep(add.intersect(mask));
          if (!add.isEmpty()) solid = scope.keep(solid.add(add));
        }
      }
      return scope.mesh(solid);
    } catch (error) {
      throw new Error(
        `Decorated body ${body.id}: ${error instanceof Error ? error.message : error}`,
      );
    } finally {
      scope.close();
    }
  });
}

export function decoratorPreview(
  runtime: ManifoldToplevel,
  document: SketchDocument,
  instance: DecoratorInstance,
): ExportMesh {
  const body = document.bodies?.find((b) => b.id === instance.faces[0].body);
  if (!body) throw new Error("Thread body is missing");
  const scope = new MeshScope(runtime, body.center);
  try {
    const operands = threadOperands(scope, document, instance, "preview");
    if (!operands) return { vertices: [], triangles: [] };
    const { mask, generated } = operands;
    return scope.mesh(mask ? scope.keep(generated.intersect(mask)) : generated);
  } finally {
    scope.close();
  }
}
