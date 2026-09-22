import type { Body } from "./body.js";
import { featureEdges } from "./feature-edges.js";

/** Boundary of the selected face set, counting wire occurrences rather than unique neighbors. */
export function faceBoundaryEdges(
  bodies: readonly Body[],
  targets: readonly { kind: string; body?: string; face?: string }[],
): { kind: "edge"; body: string; edge: string }[] {
  if (!targets.length || targets.some((t) => t.kind !== "face")) return [];
  const result: { kind: "edge"; body: string; edge: string }[] = [];
  for (const body of bodies) {
    const counts = new Map<string, number>();
    const selected = new Set(
      targets.flatMap((t) => (t.kind === "face" && t.body === body.id ? [t.face] : [])),
    );
    for (const face of body.faces.filter((f) => selected.has(f.id)))
      for (const edge of face.edges) counts.set(edge, (counts.get(edge) ?? 0) + 1);
    for (const edge of featureEdges(body))
      if (counts.get(edge.id) === 1) result.push({ kind: "edge", body: body.id, edge: edge.id });
  }
  return result;
}
