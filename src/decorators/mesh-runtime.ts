import type { ManifoldToplevel } from "manifold-3d";
import { type ExportMesh, exportMesh } from "../model/export-mesh.js";
import type { SketchDocument } from "../sketch/document.js";
import { isBuiltinDecorator, knurlDefinition } from "./builtins.js";
import { resolveFaces } from "./cylinder.js";
import { validateThread } from "./edits.js";
import type { JavaScriptDecorators } from "./javascript-hooks.js";
import { knurlOperand, knurlPreview } from "./knurl-runtime.js";
import { MeshScope } from "./mesh-scope.js";
import { exportTolerance } from "./precision.js";
import type { PreviewFeedback } from "./preview-feedback.js";
import { threadDomain } from "./thread-domain.js";
import { threadMeshes } from "./thread-mesh.js";
import { nextThreadResolution } from "./thread-preview.js";
import type { ThreadPreviewResolution } from "./thread-sampling.js";
import { threadDefinition, threadSettings } from "./thread-settings.js";
import type { DecoratorInstance } from "./types.js";

export async function initializeMeshRuntime(wasmUrl?: string): Promise<ManifoldToplevel> {
  const { default: Module } = await import("manifold-3d");
  const runtime = await Module(wasmUrl ? { locateFile: () => wasmUrl } : undefined);
  runtime.setup();
  return runtime;
}

function prepareThreadGeometry(
  document: SketchDocument,
  instance: DecoratorInstance,
  quality: "preview" | "export",
  previewResolution?: ThreadPreviewResolution,
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
    previewResolution,
  );
  if (!geometry) return null;
  return { body, faces, geometry };
}

function threadOperands(
  scope: MeshScope,
  document: SketchDocument,
  instance: DecoratorInstance,
  quality: "preview" | "export",
) {
  const prepared = prepareThreadGeometry(document, instance, quality);
  if (!prepared) return null;
  const { body, faces, geometry } = prepared;
  const mask = geometry.masks ? threadDomain(scope, body, faces, geometry) : null;
  return { mask, geometry };
}

export class PreviewRuntimeRequired extends Error {}

export function decoratedMeshes(
  runtime: ManifoldToplevel,
  document: SketchDocument,
  javascript?: JavaScriptDecorators,
): ExportMesh[] {
  return (document.bodies ?? []).map((body) => {
    const instances = (document.decorators ?? []).filter((d) =>
      d.faces.some((f) => f.body === body.id),
    );
    if (!instances.length) return exportMesh(body);
    const scope = new MeshScope(runtime, body.center, exportTolerance(instances) / 4);
    let active: DecoratorInstance | undefined;
    try {
      let solid = scope.from(exportMesh(body));
      for (const instance of instances) {
        active = instance;
        if (instance.definition === knurlDefinition) {
          const { tool, operation } = knurlOperand(scope, document, instance);
          solid = scope.keep(operation === "add" ? solid.add(tool) : solid.subtract(tool));
          continue;
        }
        if (!isBuiltinDecorator(instance.definition)) {
          if (instance.problem) throw new Error(instance.problem);
          if (!javascript)
            throw new Error(`Enable bundled code for ${instance.definition} before export`);
          for (const modification of javascript.modifications(document, instance)) {
            const operand = scope.from(modification.mesh);
            solid = scope.keep(
              modification.operation === "add" ? solid.add(operand) : solid.subtract(operand),
            );
          }
          continue;
        }
        const operands = threadOperands(scope, document, instance, "export");
        if (!operands) continue;
        const { mask, geometry } = operands;
        const direct = geometry.direct;
        if (direct) {
          let tool = scope.from(direct.mesh);
          if (mask) tool = scope.keep(tool.intersect(mask));
          solid = scope.keep(direct.operation === "add" ? solid.add(tool) : solid.subtract(tool));
          continue;
        }
        const generated = scope.from(geometry.fill);
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
        `Decorated body ${body.id}${active ? `, ${active.definition} (${active.id})` : ""}: ${error instanceof Error ? error.message : error}`,
      );
    } finally {
      scope.close();
    }
  });
}

export function decoratorPreview(
  runtime: ManifoldToplevel | undefined,
  document: SketchDocument,
  instance: DecoratorInstance,
): ExportMesh {
  if (instance.definition === knurlDefinition) {
    const mesh = knurlPreview(runtime, document, instance);
    if (!mesh) throw new PreviewRuntimeRequired();
    return mesh;
  }
  return renderThreadPreview(runtime, document, instance).mesh;
}

export function decoratorLivePreview(
  runtime: ManifoldToplevel | undefined,
  document: SketchDocument,
  instance: DecoratorInstance,
  feedback: PreviewFeedback,
): { mesh: ExportMesh; state: ThreadPreviewResolution | null } {
  if (instance.definition === knurlDefinition)
    return { mesh: decoratorPreview(runtime, document, instance), state: null };
  return renderThreadPreview(runtime, document, instance, nextThreadResolution(feedback));
}

function renderThreadPreview(
  runtime: ManifoldToplevel | undefined,
  document: SketchDocument,
  instance: DecoratorInstance,
  resolution?: ThreadPreviewResolution,
): { mesh: ExportMesh; state: ThreadPreviewResolution | null } {
  const prepared = prepareThreadGeometry(document, instance, "preview", resolution);
  if (!prepared) return { mesh: { vertices: [], triangles: [] }, state: null };
  const { body, faces, geometry } = prepared;
  // A complete cylindrical face already has the preview shell. Clipping is
  // needed only for a partial face domain.
  if (!geometry.masks) return { mesh: geometry.fill, state: geometry.resolution };
  if (!runtime) throw new PreviewRuntimeRequired();
  const scope = new MeshScope(runtime, body.center);
  try {
    const mask = threadDomain(scope, body, faces, geometry);
    const generated = scope.from(geometry.fill);
    return {
      mesh: scope.mesh(scope.keep(generated.intersect(mask))),
      state: geometry.resolution,
    };
  } finally {
    scope.close();
  }
}
