import type { SketchDocument } from "../sketch/document.js";
import { topologyOrigins } from "./body-correspondence.js";
import type { DisplayDocument } from "./display-document.js";

export interface BodyAppearance {
  readonly body: string;
  readonly color: string;
  readonly alpha: number;
}
export const defaultBodyAppearance = { color: "#cad4df", alpha: 1 };

export function validateBodyAppearances(document: DisplayDocument): void {
  if (document.bodyAppearances === undefined) return;
  if (!Array.isArray(document.bodyAppearances)) throw new Error("Invalid body appearances");
  const seen = new Set<string>();
  for (const entry of document.bodyAppearances) {
    if (
      !entry ||
      typeof entry.body !== "string" ||
      seen.has(entry.body) ||
      !document.bodies?.some((body) => body.id === entry.body) ||
      typeof entry.color !== "string" ||
      !/^#[0-9a-f]{6}$/i.test(entry.color) ||
      !Number.isFinite(entry.alpha) ||
      entry.alpha < 0 ||
      entry.alpha > 1
    )
      throw new Error("Invalid body appearance");
    seen.add(entry.body);
  }
}

export function editBodyAppearance(
  document: SketchDocument,
  appearance: BodyAppearance,
): SketchDocument {
  const previous = document.bodyAppearances?.find((entry) => entry.body === appearance.body);
  const next = { body: appearance.body, color: appearance.color, alpha: appearance.alpha };
  const candidate = {
    ...document,
    bodyAppearances: [
      ...(document.bodyAppearances ?? []).filter((entry) => entry.body !== next.body),
      next,
    ],
  };
  validateBodyAppearances(candidate);
  if (previous?.color === next.color && previous.alpha === next.alpha) return document;
  return candidate;
}

export function continueBodyAppearances<T extends DisplayDocument>(
  source: SketchDocument,
  candidate: T,
): T {
  if (!source.bodyAppearances?.length || source.bodies === candidate.bodies) return candidate;
  const bodyAppearances: BodyAppearance[] = [];
  for (const body of candidate.bodies ?? []) {
    const origins = topologyOrigins.get(body)?.bodies ?? [];
    const entry =
      source.bodyAppearances.find((entry) => entry.body === body.id) ??
      source.bodyAppearances.find((entry) => entry.body === origins[0]);
    if (entry) bodyAppearances.push({ ...entry, body: body.id });
  }
  return { ...candidate, bodyAppearances };
}
