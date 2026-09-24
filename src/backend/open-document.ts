import { validateDefinitions } from "../decorators/definition-edits.js";
import { validateDecorators } from "../decorators/edits.js";
import type { SketchDocument } from "../sketch/document.js";
import { validateSketch } from "../sketch/document.js";
import { validateFrame } from "../sketch/planes.js";
import { materialize } from "./kernel-result.js";
import type { SolidCalculator } from "./solid-calculator.js";

export async function openDocument(
  source: SketchDocument,
  kernel: SolidCalculator,
): Promise<SketchDocument> {
  validateDocument(source);
  const result = await kernel.calculate({ kind: "inspect", bodies: source.bodies ?? [] });
  const document = { ...source, bodies: materialize([], result) };
  validateDocument(document);
  return document;
}

export function validateDocument(document: SketchDocument): void {
  validateDecorators(document);
  validateDefinitions(document);
  if (
    document.units !== "mm" ||
    !Array.isArray(document.sketches) ||
    (document.bodies !== undefined && !Array.isArray(document.bodies)) ||
    (document.constructionPlanes !== undefined && !Array.isArray(document.constructionPlanes))
  )
    throw new Error("Invalid Freac document");
  if (document.entityPresentation !== undefined) {
    if (!Array.isArray(document.entityPresentation)) throw new Error("Invalid entity presentation");
    const seen = new Set<string>();
    for (const entry of document.entityPresentation) {
      if (
        !entry ||
        typeof entry.id !== "string" ||
        seen.has(entry.id) ||
        typeof entry.name !== "string" ||
        !entry.name.trim() ||
        entry.name.length > 200
      )
        throw new Error("Invalid entity presentation");
      seen.add(entry.id);
    }
  }
  const ids = new Set<string>();
  const identify = (id: string) => {
    if (typeof id !== "string" || !id || ids.has(id))
      throw new Error("Invalid or duplicate document identity");
    ids.add(id);
  };
  for (const sketch of document.sketches) {
    identify(sketch.id);
    validateSketch(sketch);
    // Curve and constraint references are scoped to their sketch.
  }
  for (const plane of document.constructionPlanes ?? []) {
    identify(plane.id);
    validateFrame(plane.frame);
  }
  for (const instance of document.decorators ?? []) identify(instance.id);
  for (const body of document.bodies ?? []) {
    identify(body.id);
    for (const face of body.faces) identify(face.id);
    for (const edge of body.edges) identify(edge.id);
  }
}
