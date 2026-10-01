import type { ManifoldToplevel } from "manifold-3d";
import type { DisplayDocument } from "../model/display-document.js";
import { resolveFaces } from "./cylinder.js";
import { validateBuiltin } from "./edits.js";
import { knurlMeshes } from "./knurl-mesh.js";
import { knurlSettings } from "./knurl-settings.js";
import type { MeshOperations, MeshSolid } from "./mesh-operations.js";
import { MeshScope } from "./mesh-scope.js";
import { threadDomain } from "./thread-domain.js";
import type { DecoratorInstance } from "./types.js";

export function prepareKnurl(
  document: DisplayDocument,
  instance: DecoratorInstance,
  quality: "preview" | "export",
) {
  if (instance.problem) throw new Error(instance.problem);
  validateBuiltin(document, instance);
  const faces = resolveFaces(document.bodies ?? [], instance.faces);
  const body = document.bodies?.find((b) => b.id === instance.faces[0].body);
  if (!body) throw new Error("Knurl body is missing");
  return {
    body,
    faces,
    geometry: knurlMeshes(instance.frame, faces, knurlSettings(instance.settings), quality),
  };
}
export function knurlOperand<S extends MeshSolid<S>>(
  scope: MeshOperations<S>,
  document: DisplayDocument,
  instance: DecoratorInstance,
) {
  const { body, faces, geometry } = prepareKnurl(document, instance, "export");
  let tool = scope.from(geometry.direct.mesh);
  if (geometry.masks) tool = scope.keep(tool.intersect(threadDomain(scope, body, faces, geometry)));
  return { tool, operation: geometry.direct.operation };
}
export function knurlPreview(
  runtime: ManifoldToplevel | undefined,
  document: DisplayDocument,
  instance: DecoratorInstance,
) {
  const { body, faces, geometry } = prepareKnurl(document, instance, "preview");
  if (!geometry.masks) return geometry.fill;
  if (!runtime) return null;
  const scope = new MeshScope(runtime, body.center);
  try {
    return scope.mesh(
      scope.keep(scope.from(geometry.fill).intersect(threadDomain(scope, body, faces, geometry))),
    );
  } finally {
    scope.close();
  }
}
