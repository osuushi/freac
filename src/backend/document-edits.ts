import { withConstructionPlane } from "../model/construction-plane.js";
import { editEntityPresentation } from "../model/entity-presentation.js";
import { copySketch } from "../sketch/copy-selection.js";
import { type SketchDocument, withSketch } from "../sketch/document.js";
import { removeCurves } from "../sketch/geometry.js";
import type { ModelRequest } from "../sketch/model-api.js";
import { mergeDocumentSketches } from "../sketch/sketch-merge.js";

export function isDirectDocumentEdit(
  request: ModelRequest,
): request is Exclude<Parameters<typeof editDocument>[1], { kind: "delete-entities" }> {
  return [
    "rename-entity",
    "reorder-entity",
    "construction-plane",
    "delete-plane",
    "place-sketch",
    "merge-sketches",
    "delete-sketch",
    "remove",
    "clear",
  ].includes(request.kind);
}

export function editDocument(
  document: SketchDocument,
  request: Extract<
    ModelRequest,
    {
      kind:
        | "rename-entity"
        | "reorder-entity"
        | "construction-plane"
        | "delete-plane"
        | "place-sketch"
        | "merge-sketches"
        | "delete-entities"
        | "delete-sketch"
        | "remove"
        | "clear";
    }
  >,
): SketchDocument {
  switch (request.kind) {
    case "rename-entity":
    case "reorder-entity":
      return editEntityPresentation(document, request);
    case "construction-plane":
      return withConstructionPlane(document, request.plane);
    case "delete-plane":
      return {
        ...document,
        constructionPlanes: (document.constructionPlanes ?? []).filter((p) => p.id !== request.id),
      };
    case "place-sketch": {
      const sketch = document.sketches.find((s) => s.id === request.sketchId);
      if (!sketch) throw new Error("Sketch no longer exists");
      return withSketch(document, {
        ...(request.duplicate ? copySketch(sketch) : sketch),
        plane: request.frame,
      });
    }
    case "merge-sketches": {
      return mergeDocumentSketches(document, request.targetSketchId, request.sourceSketchIds);
    }
    case "delete-entities": {
      const bodyIds = new Set(request.bodyIds);
      const sketchIds = new Set(request.sketchIds);
      return {
        ...document,
        ...(bodyIds.size
          ? { bodies: (document.bodies ?? []).filter((body) => !bodyIds.has(body.id)) }
          : {}),
        sketches: document.sketches.filter((sketch) => !sketchIds.has(sketch.id)),
      };
    }
    case "delete-sketch":
      return {
        ...document,
        sketches: document.sketches.filter((s) => s.id !== request.sketchId),
      };
    case "remove":
    case "clear": {
      const sketch = document.sketches.find((item) => item.id === request.sketchId);
      if (!sketch) throw new Error("Sketch no longer exists");
      const ids =
        request.kind === "clear" ? sketch.curves.map((curve) => curve.id) : (request.ids ?? []);
      return withSketch(document, removeCurves(sketch, new Set(ids)));
    }
  }
}
