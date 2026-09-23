import { curveBounds } from "./curve-geometry.js";
import type { SketchEditor } from "./editor.js";
import { type PlaneFrame, type Vector, worldPoint } from "./planes.js";

export interface PlaneBounds {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}
export const minimumPlaneBounds = (): PlaneBounds => ({ minX: -20, maxX: 20, minY: -20, maxY: 20 });
export function projectedPlaneBounds(frame: PlaneFrame, points: readonly Vector[]): PlaneBounds {
  if (!points.length) return minimumPlaneBounds();
  let minX = Infinity,
    maxX = -Infinity,
    minY = Infinity,
    maxY = -Infinity;
  for (const p of points) {
    const d = p.map((v, i) => v - frame.origin[i]);
    const x = d.reduce((sum, v, i) => sum + v * frame.u[i], 0);
    const y = d.reduce((sum, v, i) => sum + v * frame.v[i], 0);
    minX = Math.min(minX, x);
    maxX = Math.max(maxX, x);
    minY = Math.min(minY, y);
    maxY = Math.max(maxY, y);
  }
  const xMargin = (maxX - minX) * 0.2,
    yMargin = (maxY - minY) * 0.2;
  return {
    minX: Math.min(-20, minX - xMargin),
    maxX: Math.max(20, maxX + xMargin),
    minY: Math.min(-20, minY - yMargin),
    maxY: Math.max(20, maxY + yMargin),
  };
}
export function planeCorners(frame: PlaneFrame, bounds: PlaneBounds): Vector[] {
  return [
    [bounds.minX, bounds.minY],
    [bounds.maxX, bounds.minY],
    [bounds.maxX, bounds.maxY],
    [bounds.minX, bounds.maxY],
  ].map(([x, y]) => worldPoint(frame, { x, y }));
}
/** Accepted visible geometry only; transient gestures never chase a moving patch. */
export function installPlaneBounds(editor: SketchEditor): void {
  let document = editor.store.data,
    visibility = "",
    points: Vector[] = [];
  editor.world.planeBounds = (frame) => {
    const key = `${editor.bodiesVisible}:${editor.visibility.key}`;
    if (!editor.interactions.current && (document !== editor.store.data || visibility !== key)) {
      document = editor.store.data;
      visibility = key;
      const samples: Vector[] = [];
      for (const body of editor.bodiesVisible ? (document.bodies ?? []) : []) {
        if (!editor.visibility.visible(body.id)) continue;
        for (const x of [body.bounds[0], body.bounds[3]])
          for (const y of [body.bounds[1], body.bounds[4]])
            for (const z of [body.bounds[2], body.bounds[5]]) samples.push([x, y, z]);
      }
      for (const sketch of document.sketches)
        if (editor.visibility.visible(sketch.id))
          for (const curve of sketch.curves)
            samples.push(...curveBounds(curve).map((p) => worldPoint(sketch.plane, p)));
      // Project the global visible-item bounding box, rather than each item's footprint.
      if (samples.length) {
        const low = [Infinity, Infinity, Infinity],
          high = [-Infinity, -Infinity, -Infinity];
        for (const p of samples)
          for (let i = 0; i < 3; i++) {
            low[i] = Math.min(low[i], p[i]);
            high[i] = Math.max(high[i], p[i]);
          }
        points = [];
        for (const x of [low[0], high[0]])
          for (const y of [low[1], high[1]])
            for (const z of [low[2], high[2]]) points.push([x, y, z]);
      } else points = [];
    }
    return projectedPlaneBounds(frame, points);
  };
}
