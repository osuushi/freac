import type { SketchDocument } from "../sketch/document.js";
import { isBuiltinDecorator } from "./builtins.js";

/** Include the support body: trimmed threads can depend on adjacent faces. */
export function previewSignatures(
  document: SketchDocument,
  sourcesKey: string,
): Map<string, string> {
  const result = new Map<string, string>();
  let customDocumentKey: string | undefined;
  for (const instance of document.decorators ?? []) {
    if (instance.problem) continue;
    if (!isBuiltinDecorator(instance.definition)) {
      customDocumentKey ??= JSON.stringify([document, sourcesKey]);
      result.set(instance.id, customDocumentKey);
      continue;
    }
    const bodies = [...new Set(instance.faces.map((face) => face.body))].map((id) => {
      const body = document.bodies?.find((candidate) => candidate.id === id);
      return body && { center: body.center, faces: body.faces };
    });
    result.set(
      instance.id,
      JSON.stringify([
        instance.definition,
        instance.version,
        instance.faces,
        instance.settings,
        instance.frame,
        instance.axialReference,
        bodies,
      ]),
    );
  }
  return result;
}

export function previewFingerprint(signatures: ReadonlyMap<string, string>, live: boolean): string {
  return JSON.stringify([live, [...signatures].sort(([a], [b]) => a.localeCompare(b))]);
}
