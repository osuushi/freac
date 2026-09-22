import { curveDistance, displayPoints } from "../sketch/curve-geometry.js";
import type { SketchEditor } from "../sketch/editor.js";
import { segmentDistance } from "../sketch/geometry.js";
import type { Point } from "../sketch/planes.js";
import { worldPoint } from "../sketch/planes.js";
import { pickFace } from "./body-view.js";
import { pickBodyEdge } from "./edge-selection.js";
import { featureEdges } from "./feature-edges.js";
import { coverageTargets } from "./operation-selection.js";
import { type ProjectionSource, projectionCurves } from "./projection.js";
import { selectionContext } from "./selection-context.js";
export const projectionKey = (s: ProjectionSource) =>
  s.kind === "face"
    ? `face/${s.body}/${s.face}`
    : s.kind === "edge"
      ? s.edge
      : `${s.sketch}/${s.curve}`;
export function projectionSelection(e: SketchEditor): ProjectionSource[] {
  if (e.world.active && e.sketch)
    return [...e.selectedCurves].map((curve) => ({
      kind: "curve",
      sketch: e.sketch?.id ?? "",
      curve,
    }));
  const sources = coverageTargets(selectionContext(e.modeling.targets, e.store.data)).flatMap(
    (t): ProjectionSource[] => {
      if (t.kind === "edge" || t.kind === "face") return [t];
      if (t.kind === "body") {
        const body = e.store.data.bodies?.find((b) => b.id === t.body);
        return body
          ? featureEdges(body).map((edge) => ({ kind: "edge", body: body.id, edge: edge.id }))
          : [];
      }
      const sketch = e.store.data.sketches.find((s) => s.id === t.sketch);
      const ids =
        t.kind === "profile"
          ? new Set([...t.profile.outer, ...t.profile.holes.flat()].map((s) => s.curve.id))
          : null;
      return (
        sketch?.curves
          .filter((c) => !c.construction && (!ids || ids.has(c.id)))
          .map((c) => ({ kind: "curve", sketch: sketch.id, curve: c.id })) ?? []
      );
    },
  );
  return sources.filter(
    (s, i) => sources.findIndex((p) => projectionKey(p) === projectionKey(s)) === i,
  );
}
export function pickProjectionSource(e: SketchEditor, screen: Point): ProjectionSource | null {
  const edge = pickBodyEdge(e, screen);
  if (edge) return { kind: "edge", body: edge.body, edge: edge.edge };
  let best: { source: ProjectionSource; distance: number } | undefined;
  for (const sketch of e.store.data.sketches) {
    if (!e.visibility.visible(sketch.id)) continue;
    const local = e.world.pointAt(sketch.plane, screen.x, screen.y);
    for (const curve of sketch.curves) {
      if (local && curveDistance(curve, local) > e.world.height * 0.1) continue;
      const points = displayPoints(curve, e.world.height / e.world.canvas.clientHeight).map((p) =>
        e.world.projectLocal(sketch.plane, p),
      );
      const d = Math.min(...points.slice(1).map((p, i) => segmentDistance(screen, points[i], p)));
      if (d < 7 && (!best || d < best.distance))
        best = { source: { kind: "curve", sketch: sketch.id, curve: curve.id }, distance: d };
    }
  }
  if (best) return best.source;
  const face = pickFace(e, screen);
  return face ? { kind: "face", body: face.body, face: face.face } : null;
}
export function projectionLines(e: SketchEditor, sources: readonly ProjectionSource[]): number[][] {
  return projectionCurves(e.store.data, sources).flatMap((s) => {
    if (s.kind === "edge") {
      const edge = e.store.data.bodies
        ?.find((b) => b.id === s.body)
        ?.edges.find((c) => c.id === s.edge);
      return edge ? [[...edge.points]] : [];
    }
    const sketch = e.store.data.sketches.find((sketch) => sketch.id === s.sketch),
      curve = sketch?.curves.find((c) => c.id === s.curve);
    return sketch && curve
      ? [
          displayPoints(curve, e.world.height / e.world.canvas.clientHeight).flatMap((p) =>
            worldPoint(sketch.plane, p),
          ),
        ]
      : [];
  });
}
