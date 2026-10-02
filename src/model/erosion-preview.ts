import type { SketchDocument } from "../sketch/document.js";
import type { BodyErosion } from "./body.js";
import { defaultBodyAppearance } from "./body-appearance.js";

/** Source ghosting belongs to the temporary view, never accepted appearances. */
export function erosionPreview(
  candidate: SketchDocument,
  original: SketchDocument,
  operation: BodyErosion,
) {
  const accepted = new Set(original.bodies?.map((body) => body.id));
  const count = candidate.bodies?.filter((body) => !accepted.has(body.id)).length ?? 0;
  return {
    count,
    document: operation.keepOriginals
      ? {
          ...candidate,
          bodyAppearances: [
            ...(candidate.bodyAppearances ?? []).filter(
              (entry) => !operation.ids.includes(entry.body),
            ),
            ...operation.ids.map((body) => ({
              body,
              ...(candidate.bodyAppearances?.find((entry) => entry.body === body) ??
                defaultBodyAppearance),
              alpha: 0.15,
            })),
          ],
        }
      : candidate,
  };
}
