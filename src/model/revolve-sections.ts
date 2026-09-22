import * as THREE from "three";
import { boundaryPoints } from "../sketch/curve-spans.js";
import type { SketchEditor } from "../sketch/editor.js";
import { type Vector, worldPoint } from "../sketch/planes.js";
import { profilesFor } from "../sketch/profiles.js";
import type { LiftSource } from "./body.js";
import type { RevolveAxis } from "./revolve-axis.js";

/** Display-only outlines; the native kernel receives analytic curve boundaries. */
export function revolveSections(
  editor: SketchEditor,
  sources: LiftSource[],
  axis: RevolveAxis,
  angle: number,
  height: number,
): Vector[][] {
  const loops: Vector[][] = [];
  for (const target of sources) {
    if ("sketch" in target) {
      const sketch = editor.store.data.sketches.find((s) => s.id === target.sketch);
      if (!sketch) continue;
      const profile = profilesFor(sketch).find((p) => p.key === target.profile);
      if (!profile) continue;
      for (const loop of [profile.outer, ...profile.holes]) {
        const points = boundaryPoints(loop, 0.03).map((p) => worldPoint(sketch.plane, p));
        if (points.length) loops.push([...points, points[0]]);
      }
    } else {
      const body = editor.store.data.bodies?.find((b) => b.faces.some((f) => f.id === target.face));
      const face = body?.faces.find((f) => f.id === target.face);
      for (const edge of body?.edges ?? []) {
        if (!face?.edges.includes(edge.id)) continue;
        const points: Vector[] = [];
        for (let i = 0; i < edge.points.length; i += 3)
          points.push(edge.points.slice(i, i + 3) as Vector);
        loops.push(points);
      }
    }
  }
  const origin = new THREE.Vector3(...axis.origin),
    n = new THREE.Vector3(...axis.direction);
  return loops.flatMap((loop) => [
    loop,
    loop.map(
      (p) =>
        new THREE.Vector3(...p)
          .sub(origin)
          .applyAxisAngle(n, (angle * Math.PI) / 180)
          .add(origin)
          .addScaledVector(n, height)
          .toArray() as Vector,
    ),
  ]);
}
