import type { SketchDocument } from "../sketch/document.js";
import { planes } from "../sketch/planes.js";
import { definitionSettings } from "./definition.js";
import type {
  DecoratorDiagnostic,
  DecoratorGroup,
  JavaScriptDecorators,
} from "./javascript-hooks.js";
import type { DecoratorInstance, FaceReference } from "./types.js";

export interface DecoratorInspectionRequest {
  definition: string;
  version: number;
  faces: FaceReference[];
  instanceId?: string;
}
export interface DecoratorInspection {
  reason: string | null;
  groups: DecoratorGroup[];
  diagnostics: DecoratorDiagnostic[];
}

export function inspectDecorator(
  document: SketchDocument,
  request: DecoratorInspectionRequest,
  hooks: JavaScriptDecorators,
): DecoratorInspection {
  try {
    const definition = hooks.definition(document, request.definition, request.version);
    if (!request.faces.length) throw new Error("Select faces to decorate");
    const existing = request.instanceId
      ? document.decorators?.find((d) => d.id === request.instanceId)
      : undefined;
    if (
      request.instanceId &&
      (!existing ||
        existing.definition !== definition.id ||
        existing.version !== definition.version)
    )
      throw new Error("Select an existing decorator instance");
    const instance: DecoratorInstance = existing
      ? { ...existing, faces: request.faces }
      : {
          id: "inspection",
          definition: definition.id,
          version: definition.version,
          faces: request.faces,
          settings: definitionSettings(definition, {}),
          frame: planes.XY,
        };
    if (
      document.decorators?.some(
        (d) =>
          !d.problem &&
          d.id !== existing?.id &&
          d.definition !== definition.id &&
          d.faces.some((f) => request.faces.some((r) => r.body === f.body && r.face === f.face)),
      )
    )
      throw new Error("Remove the existing decorator before applying another");
    const groups = hooks.partition(document, instance);
    const diagnostics = existing
      ? hooks.diagnostics(document, instance)
      : groups.flatMap((group) => hooks.diagnostics(document, { ...instance, ...group }));
    return {
      reason: diagnostics.find((d) => d.severity === "error")?.message ?? null,
      groups,
      diagnostics,
    };
  } catch (error) {
    return {
      reason: error instanceof Error ? error.message : String(error),
      groups: [],
      diagnostics: [],
    };
  }
}
