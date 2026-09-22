import * as THREE from "three";
import type { SketchEditor } from "../sketch/editor.js";
import { type PlaneFrame, type Point, planes, worldPoint } from "../sketch/planes.js";
import { pickFace } from "./body-view.js";

/** Pick the displayed patches, not their infinite support or SVG outline. */
export function pickPlaneInterior(
  editor: SketchEditor,
  screen: Point,
  accepts: (frame: PlaneFrame) => boolean,
): { frame: PlaneFrame; vertices: number[] } | null {
  const rect = editor.world.canvas.getBoundingClientRect();
  const ray = new THREE.Raycaster();
  ray.setFromCamera(
    new THREE.Vector2(
      ((screen.x - rect.left) / rect.width) * 2 - 1,
      1 - ((screen.y - rect.top) / rect.height) * 2,
    ),
    editor.world.camera,
  );
  const faceHit = pickFace(editor, screen);
  const face =
    faceHit &&
    editor.display.bodies
      ?.find((body) => body.id === faceHit.body)
      ?.faces.find((face) => face.id === faceHit.face);
  let closest =
    faceHit && face?.plane && accepts(face.plane)
      ? { frame: face.plane, depth: faceHit.depth, vertices: face.vertices }
      : null;
  const frames = [
    ...Object.values(planes),
    ...(editor.store.data.constructionPlanes ?? [])
      .filter((plane) => editor.visibility.visible(plane.id))
      .map((plane) => plane.frame),
  ];
  for (const frame of frames) {
    if (!accepts(frame)) continue;
    const origin = new THREE.Vector3(...frame.origin);
    const u = new THREE.Vector3(...frame.u),
      v = new THREE.Vector3(...frame.v);
    const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(u.clone().cross(v), origin);
    const hit = ray.ray.intersectPlane(plane, new THREE.Vector3());
    if (!hit) continue;
    const local = hit.clone().sub(origin);
    if (Math.abs(local.dot(u)) > 20 || Math.abs(local.dot(v)) > 20) continue;
    const depth = hit.distanceTo(editor.world.camera.position);
    if (!closest || depth < closest.depth)
      closest = { frame, depth, vertices: planePatchVertices(frame) };
  }
  return closest;
}

export function planePatchVertices(frame: PlaneFrame): number[] {
  return [
    [-20, -20],
    [20, -20],
    [20, 20],
    [-20, -20],
    [20, 20],
    [-20, 20],
  ].flatMap(([x, y]) => worldPoint(frame, { x, y }));
}
