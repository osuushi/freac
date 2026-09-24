import Module, { type Manifold, type ManifoldToplevel } from "manifold-3d";
import { type ExportMesh, exportMesh, validateMesh } from "../model/export-mesh.js";
import type { SketchDocument } from "../sketch/document.js";
import { resolveFaces } from "./cylinder.js";
import { validateThread } from "./edits.js";
import { threadMeshes } from "./thread-mesh.js";
import { threadDefinition, threadSettings } from "./thread-settings.js";
import type { DecoratorInstance } from "./types.js";

export async function initializeMeshRuntime(wasmUrl?: string): Promise<ManifoldToplevel> {
  const runtime = await Module(wasmUrl ? { locateFile: () => wasmUrl } : undefined);
  runtime.setup();
  return runtime;
}

class MeshScope {
  private handles: Manifold[] = [];
  constructor(readonly runtime: ManifoldToplevel) {}
  keep(solid: Manifold): Manifold {
    this.handles.push(solid);
    return solid;
  }
  from(mesh: ExportMesh): Manifold {
    validateMesh(mesh);
    return this.keep(
      new this.runtime.Manifold(
        new this.runtime.Mesh({
          numProp: 3,
          vertProperties: new Float32Array(mesh.vertices.flat()),
          triVerts: new Uint32Array(mesh.triangles.flat()),
        }),
      ),
    );
  }
  mesh(solid: Manifold): ExportMesh {
    const status = solid.status();
    if (status !== "NoError") throw new Error(`Mesh generation failed: ${status}`);
    const result = solid.getMesh();
    const mesh: ExportMesh = { vertices: [], triangles: [] };
    for (let i = 0; i < result.vertProperties.length; i += result.numProp)
      mesh.vertices.push(Array.from(result.vertProperties.slice(i, i + 3)));
    for (let i = 0; i < result.triVerts.length; i += 3)
      mesh.triangles.push(Array.from(result.triVerts.slice(i, i + 3)));
    validateMesh(mesh);
    return mesh;
  }
  close(): void {
    for (const handle of this.handles.reverse()) handle.delete();
  }
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
  const geometry = threadMeshes(
    instance.frame,
    resolveFaces(document.bodies ?? [], instance.faces),
    threadSettings(instance.settings),
    quality,
  );
  const band = scope.from(geometry.band);
  const mask = geometry.mask ? scope.keep(scope.from(geometry.mask).intersect(band)) : band;
  const generated = scope.from(geometry.fill);
  const fill = geometry.mask ? scope.keep(generated.intersect(mask)) : generated;
  return { mask, fill };
}

export function decoratedMeshes(runtime: ManifoldToplevel, document: SketchDocument): ExportMesh[] {
  return (document.bodies ?? []).map((body) => {
    const instances = (document.decorators ?? []).filter((d) =>
      d.faces.some((f) => f.body === body.id),
    );
    if (!instances.length) return exportMesh(body);
    const scope = new MeshScope(runtime);
    try {
      let solid = scope.from(exportMesh(body));
      for (const instance of instances) {
        const { mask, fill } = threadOperands(scope, document, instance, "export");
        solid = scope.keep(scope.keep(solid.subtract(mask)).add(fill));
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
  const scope = new MeshScope(runtime);
  try {
    return scope.mesh(threadOperands(scope, document, instance, "preview").fill);
  } finally {
    scope.close();
  }
}
