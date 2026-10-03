import * as THREE from "three";
import { boundaryPoints } from "../sketch/curve-spans.js";
import type { SketchEditor } from "../sketch/editor.js";
import { worldPoint } from "../sketch/planes.js";
import type { OverlapTarget } from "./overlap-candidates.js";
import type { PreviewGeometry } from "./overlap-geometry.js";

export function overlapRegionGeometry(
  editor: SketchEditor,
  target: Extract<OverlapTarget, { kind: "profile" | "profiles" }>,
): PreviewGeometry {
  const result: PreviewGeometry = { surfaces: [], lines: [] };
  const sketch = editor.display.sketches.find((s) => s.id === target.sketch);
  if (!sketch || !editor.visibility.visible(sketch.id)) return result;
  const profiles = target.kind === "profile" ? [target.profile] : target.profiles;
  const scale = editor.world.height / editor.world.canvas.clientHeight;
  for (const profile of profiles) {
    const loops = [profile.outer, ...profile.holes].map((loop) => boundaryPoints(loop, scale));
    const points = loops.flat().map((p) => worldPoint(sketch.plane, p));
    const [outer, ...holes] = loops.map((loop) => loop.map((p) => new THREE.Vector2(p.x, p.y)));
    for (const triangle of THREE.ShapeUtils.triangulateShape(outer, holes))
      result.surfaces.push(triangle.map((i) => points[i]));
    for (const loop of loops) {
      const line = loop.map((p) => worldPoint(sketch.plane, p));
      result.lines.push([...line, line[0]]);
    }
  }
  return result;
}
