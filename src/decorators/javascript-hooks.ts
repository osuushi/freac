import type { QuickJSWASMModule } from "quickjs-emscripten-core";
import { type ExportMesh, triangleNormal, validateMesh } from "../model/export-mesh.js";
import type { SketchDocument } from "../sketch/document.js";
import { type DecoratorDefinition, definitionSettings } from "./definition.js";
import { runDecoratorHook } from "./javascript-runtime.js";
import { type PreviewFeedback, previewState } from "./preview-feedback.js";
import type { DecoratorInstance, FaceReference, MeshModification } from "./types.js";

export interface DecoratorPreviewResult {
  mesh: ExportMesh | null;
  state: unknown | null;
}

export interface EnabledDefinition {
  id: string;
  version: number;
  source: string;
}
export interface DecoratorDiagnostic {
  severity: "warning" | "error";
  message: string;
  faces?: FaceReference[];
  edges?: { body: string; edge: string }[];
}
export interface DecoratorGroup {
  faces: FaceReference[];
  state?: unknown;
}

export function geometryContext(document: SketchDocument, selection: readonly FaceReference[]) {
  const ids = new Set(selection.map((f) => f.body));
  for (const ref of selection)
    if (!document.bodies?.some((b) => b.id === ref.body && b.faces.some((f) => f.id === ref.face)))
      throw new Error("Decorator target no longer exists");
  return {
    units: "mm",
    selection,
    bodies: (document.bodies ?? [])
      .filter((b) => ids.has(b.id))
      .map(({ brep: _, ...body }) => body),
  };
}

/** Trusted host dispatch; enablement is session state and never read from document data. */
export class JavaScriptDecorators {
  constructor(
    private runtime: QuickJSWASMModule,
    private enabled: readonly EnabledDefinition[] = [],
  ) {}
  definition(document: SketchDocument, id: string, version: number): DecoratorDefinition {
    const definition = document.decoratorDefinitions?.find(
      (d) => d.id === id && d.version === version,
    );
    if (!definition) throw new Error(`Missing decorator: ${id} v${version}`);
    if (
      !this.enabled.some(
        (e) => e.id === id && e.version === version && e.source === definition.source,
      )
    )
      throw new Error(`Enable bundled code for ${definition.name} before using this decorator`);
    return definition;
  }
  invoke(
    document: SketchDocument,
    instance: DecoratorInstance,
    hook: string,
    extra = {},
    milliseconds?: number,
  ) {
    const definition = this.definition(document, instance.definition, instance.version);
    return runDecoratorHook(
      this.runtime,
      definition.source,
      hook,
      {
        ...geometryContext(document, instance.faces),
        instance,
        settings: definitionSettings(definition, instance.settings),
        ...extra,
      },
      milliseconds,
    );
  }
  partition(document: SketchDocument, instance: DecoratorInstance): DecoratorGroup[] {
    const result = this.invoke(document, instance, "partition") as {
      groups?: DecoratorGroup[];
      reason?: string;
    };
    if (result?.reason) throw new Error(String(result.reason));
    if (!Array.isArray(result?.groups) || !result.groups.length)
      throw new Error("Decorator rejected this selection");
    const remaining = new Set(instance.faces.map((f) => `${f.body}/${f.face}`));
    for (const group of result.groups) {
      if (!Array.isArray(group?.faces) || !group.faces.length)
        throw new Error("Invalid decorator group");
      const body = group.faces[0].body;
      for (const ref of group.faces)
        if (ref.body !== body || !remaining.delete(`${ref.body}/${ref.face}`))
          throw new Error("Decorator groups must partition selected faces within each body");
      if (JSON.stringify(group.state ?? null).length > 65536)
        throw new Error("Decorator continuity state exceeds 64 KiB");
    }
    if (remaining.size) throw new Error("Decorator partition omitted selected faces");
    return result.groups.map((group) => ({
      faces: group.faces.map(({ body, face }) => ({ body, face })),
      ...(group.state === undefined ? {} : { state: group.state }),
    }));
  }
  diagnostics(document: SketchDocument, instance: DecoratorInstance): DecoratorDiagnostic[] {
    const result = this.invoke(document, instance, "validate");
    if (!Array.isArray(result) || result.length > 100)
      throw new Error("Invalid decorator diagnostics");
    const bodies = new Set(instance.faces.map((f) => f.body));
    for (const d of result) {
      if (
        !d ||
        !["warning", "error"].includes(d.severity) ||
        typeof d.message !== "string" ||
        d.message.length > 2000 ||
        (d.faces !== undefined &&
          (!Array.isArray(d.faces) ||
            d.faces.some(
              (f: FaceReference) =>
                !f ||
                !bodies.has(f.body) ||
                !document.bodies
                  ?.find((b) => b.id === f.body)
                  ?.faces.some((face) => face.id === f.face),
            ))) ||
        (d.edges !== undefined &&
          (!Array.isArray(d.edges) ||
            d.edges.some(
              (e: { body: string; edge: string }) =>
                !e ||
                !bodies.has(e.body) ||
                !document.bodies
                  ?.find((b) => b.id === e.body)
                  ?.edges.some((edge) => edge.id === e.edge),
            )))
      )
        throw new Error("Invalid decorator diagnostic or highlighted geometry");
    }
    return result;
  }
  modifications(document: SketchDocument, instance: DecoratorInstance): MeshModification[] {
    const error = this.diagnostics(document, instance).find((d) => d.severity === "error");
    if (error) throw new Error(error.message);
    const result = this.invoke(document, instance, "generate", {
      quality: "export",
      tolerance: 0.004,
    });
    if (!Array.isArray(result) || result.length > 100)
      throw new Error("Invalid decorator mesh modifications");
    for (const modification of result) {
      if (!modification || !["add", "subtract"].includes(modification.operation))
        throw new Error("Invalid decorator mesh operation");
      validateGeneratedMesh(modification.mesh);
    }
    return result;
  }
  preview(
    document: SketchDocument,
    instance: DecoratorInstance,
    live = false,
    feedback: PreviewFeedback = { targetMs: 100, history: [] },
  ): DecoratorPreviewResult | null {
    const definition = this.definition(document, instance.definition, instance.version);
    if (!definition.preview || (live && !definition.livePreview)) return null;
    const result = this.invoke(
      document,
      instance,
      "preview",
      {
        quality: "preview",
        tolerance: live ? 0.2 : 0.08,
        live,
        preview: feedback,
      },
      live ? Math.min(100, feedback.targetMs) : undefined,
    ) as ExportMesh | { mesh: ExportMesh | null; state?: unknown } | null;
    if (result === null) return { mesh: null, state: null };
    if (typeof result !== "object" || !result) throw new Error("Invalid decorator preview result");
    const wrapped = "mesh" in result;
    const mesh = wrapped ? result.mesh : result;
    if (mesh) validateGeneratedMesh(mesh, false);
    return { mesh, state: previewState(wrapped ? result.state : null) };
  }
}

export function validateGeneratedMesh(mesh: ExportMesh, closed = true): void {
  if (
    !mesh ||
    !Array.isArray(mesh.vertices) ||
    !Array.isArray(mesh.triangles) ||
    mesh.vertices.length > 1_000_000 ||
    mesh.triangles.length > 2_000_000 ||
    mesh.vertices.some(
      (p) =>
        !Array.isArray(p) ||
        p.length !== 3 ||
        !p.every((n) => typeof n === "number" && Number.isFinite(n)),
    ) ||
    mesh.triangles.some(
      (t) =>
        !Array.isArray(t) ||
        t.length !== 3 ||
        !t.every((i) => Number.isInteger(i) && i >= 0 && i < mesh.vertices.length),
    )
  )
    throw new Error("Invalid or oversized generated mesh");
  if (closed) validateMesh(mesh);
  else for (const t of mesh.triangles) triangleNormal(t.map((i) => mesh.vertices[i]));
}
