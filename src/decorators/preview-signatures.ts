import type { Body } from "../model/body.js";
import type { SketchDocument } from "../sketch/document.js";
import { isBuiltinDecorator } from "./builtins.js";

/** View/queue-local serialization of immutable support inputs; no document authority. */
export class PreviewSignatureCache {
  private supports = new WeakMap<Body, string>();
  private documents = new WeakMap<SketchDocument, string>();
  support(body: Body | undefined): string {
    if (!body) return "null";
    let key = this.supports.get(body);
    if (key === undefined) {
      key = JSON.stringify({ center: body.center, faces: body.faces });
      this.supports.set(body, key);
    }
    return key;
  }
  custom(document: SketchDocument, sourcesKey: string): string {
    let key = this.documents.get(document);
    if (key === undefined) {
      key = JSON.stringify(document);
      this.documents.set(document, key);
    }
    return `[${key},${JSON.stringify(sourcesKey)}]`;
  }
}

/** Include the support body: trimmed threads can depend on adjacent faces. */
export function previewSignatures(
  document: SketchDocument,
  sourcesKey: string,
  cache = new PreviewSignatureCache(),
): Map<string, string> {
  const result = new Map<string, string>();
  let customDocumentKey: string | undefined;
  for (const instance of document.decorators ?? []) {
    if (instance.problem) continue;
    if (!isBuiltinDecorator(instance.definition)) {
      customDocumentKey ??= cache.custom(document, sourcesKey);
      result.set(instance.id, customDocumentKey);
      continue;
    }
    const bodies = [...new Set(instance.faces.map((face) => face.body))].map((id) => {
      const body = document.bodies?.find((candidate) => candidate.id === id);
      return cache.support(body);
    });
    const parameters = JSON.stringify([
      instance.definition,
      instance.version,
      instance.faces,
      instance.settings,
      instance.frame,
      instance.axialReference,
    ]);
    // Fragments come only from JSON.stringify; preserve the existing signature bytes
    // while avoiding another serialization of large face arrays for every instance.
    result.set(instance.id, `${parameters.slice(0, -1)},[${bodies.join(",")}]]`);
  }
  return result;
}

export function previewFingerprint(signatures: ReadonlyMap<string, string>, live: boolean): string {
  return JSON.stringify([live, [...signatures].sort(([a], [b]) => a.localeCompare(b))]);
}
