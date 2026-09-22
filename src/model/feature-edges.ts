import type { Body, Edge } from "./body.js";

const cache = new WeakMap<Body, readonly Edge[]>();
/** A periodic seam occurs twice in one face's wire. Retain it in exact topology,
 * but do not offer it as a modeling edge or an invisible snap target. */
export function featureEdges(body: Body): readonly Edge[] {
  const previous = cache.get(body);
  if (previous) return previous;
  const seams = new Set<string>();
  for (const face of body.faces) {
    const seen = new Set<string>();
    for (const id of face.edges) {
      if (seen.has(id)) seams.add(id);
      seen.add(id);
    }
  }
  const edges = body.edges.filter((edge) => !seams.has(edge.id));
  cache.set(body, edges);
  return edges;
}
