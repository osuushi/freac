import type { Curve, SketchDocument } from "../sketch/document.js";
import type { PlaneFrame } from "../sketch/planes.js";
import type { Edge } from "./body.js";
import { edgeCurve } from "./copy-edge.js";
import { featureEdges } from "./feature-edges.js";

const cache = new WeakMap<SketchDocument, WeakMap<PlaneFrame, { edge: Edge; curve: Curve }[]>>();
export function planarBodyEdges(document: SketchDocument, frame: PlaneFrame) {
  let frames = cache.get(document);
  if (!frames) {
    frames = new WeakMap();
    cache.set(document, frames);
  }
  const previous = frames.get(frame);
  if (previous) return previous;
  const edges = (document.bodies ?? [])
    .flatMap((body) => featureEdges(body))
    .flatMap((edge) => {
      try {
        return [{ edge, curve: edgeCurve(edge, frame) }];
      } catch {
        return [];
      }
    });
  frames.set(frame, edges);
  return edges;
}
