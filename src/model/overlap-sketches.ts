import * as THREE from "three";
import { curveDistance, displayPoints } from "../sketch/curve-geometry.js";
import type { Sketch } from "../sketch/document.js";
import type { SketchEditor } from "../sketch/editor.js";
import { coplanar, type PlaneFrame, type Point, worldPoint } from "../sketch/planes.js";
import { connectedProfiles } from "../sketch/profile-adjacency.js";
import { profileAt, profilesFor } from "../sketch/profiles.js";
import type { OverlapCandidate } from "./overlap-candidates.js";

export function sketchPreviewLines(editor: SketchEditor, sketch: Sketch) {
  return sketch.curves.map((curve) =>
    displayPoints(curve, editor.world.height / editor.world.canvas.clientHeight).map((p) =>
      worldPoint(sketch.plane, p),
    ),
  );
}

export function overlapSketchCandidates(
  editor: SketchEditor,
  screen: Point,
  planes: PlaneFrame[],
): OverlapCandidate[] {
  const result: OverlapCandidate[] = [];
  const tolerance = (editor.world.height / editor.world.canvas.clientHeight) * 6;
  for (const sketch of editor.display.sketches) {
    if (!editor.visibility.visible(sketch.id)) continue;
    const point = editor.world.pointAt(sketch.plane, screen.x, screen.y);
    if (!point) continue;
    const profile = profileAt(sketch, point);
    if (!sketch.curves.some((c) => curveDistance(c, point) < tolerance) && !profile) continue;
    const p = worldPoint(sketch.plane, point),
      camera = editor.world.camera.position;
    if (!editor.world.visiblePoint(new THREE.Vector3(...p))) continue;
    const depth = Math.hypot(p[0] - camera.x, p[1] - camera.y, p[2] - camera.z);
    if (profile) {
      result.push({
        target: { kind: "profile", sketch: sketch.id, profile },
        key: profile.key,
        label: "Region",
        depth,
      });
      const profiles = connectedProfiles(profilesFor(sketch), profile);
      if (profiles.length > 1)
        result.push({
          target: { kind: "profiles", sketch: sketch.id, profiles },
          key: `${profile.key}/connected`,
          label: "Connected regions",
          depth,
        });
    }
    if (planes.some((p) => coplanar(p, sketch.plane))) continue;
    result.push({
      target: { kind: "sketch", sketch: sketch.id },
      key: sketch.id,
      label: "Sketch",
      depth,
    });
  }
  return result;
}
