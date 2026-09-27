import * as THREE from "three";
import { displayPoints } from "./curve-geometry.js";
import type { SketchEditor } from "./editor.js";
import { clipOrbitSegment, nearestOrbitSegment, orbitClipPlanes } from "./orbit-projection.js";
import { nearestOrbitSurface } from "./orbit-surface.js";
import { type Point, worldPoint } from "./planes.js";

/** Mouse and touch use their press coordinates; selection and stale hover state are irrelevant. */
export function orbitPivot(editor: SketchEditor, press: Point): THREE.Vector3 {
  const world = editor.world,
    camera = world.camera;
  const rect = world.canvas.getBoundingClientRect(),
    aspect = rect.width / Math.max(1, rect.height);
  const ndc = new THREE.Vector2(
    (2 * (press.x - rect.left)) / rect.width - 1,
    1 - (2 * (press.y - rect.top)) / rect.height,
  );
  const bodies = editor.bodiesVisible
    ? (editor.display.bodies ?? []).filter((b) => editor.visibility.visible(b.id))
    : [];
  const clipping = world.renderer.clippingPlanes;
  const surface = nearestOrbitSurface(camera, bodies, ndc, aspect, clipping);
  if (surface) return surface;
  // Wire-only workspaces have no surfaces: use their closest visible curve point.
  const planes = orbitClipPlanes(camera, clipping),
    pointer = new THREE.Vector2(ndc.x * aspect, ndc.y);
  let bestPoint: THREE.Vector3 | null = null;
  let bestDistance = Infinity;
  const line = (points: THREE.Vector3[]) => {
    for (let i = 1; i < points.length; i++) {
      const clipped = clipOrbitSegment(points[i - 1], points[i], planes);
      if (!clipped) continue;
      const candidate = nearestOrbitSegment(clipped[0], clipped[1], pointer, camera, aspect);
      if (candidate.distance < bestDistance) {
        bestPoint = candidate.point;
        bestDistance = candidate.distance;
      }
    }
  };
  for (const body of bodies)
    for (const edge of body.edges) {
      const points: THREE.Vector3[] = [];
      for (let i = 0; i < edge.points.length; i += 3)
        points.push(new THREE.Vector3().fromArray(edge.points, i));
      line(points);
    }
  for (const sketch of editor.display.sketches)
    if (editor.visibility.visible(sketch.id))
      for (const curve of sketch.curves)
        line(
          displayPoints(curve, world.height / Math.max(1, rect.height)).map(
            (p) => new THREE.Vector3(...worldPoint(sketch.plane, p)),
          ),
        );
  return bestPoint ?? world.target.clone();
}
