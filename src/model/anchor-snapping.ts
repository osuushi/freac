import * as THREE from "three";
import type { SketchEditor } from "../sketch/editor.js";
import { pointHits } from "../sketch/picking.js";
import { type Point, type Vector, worldPoint } from "../sketch/planes.js";
import type { Body, Face } from "./body.js";
import { featureEdges } from "./feature-edges.js";

function faceCenter(body: Body, face: Face): Vector | null {
  if (!face.plane) return null;
  const edges = featureEdges(body).filter((edge) => face.edges.includes(edge.id));
  if (edges.length === 1 && edges[0].curve?.kind === "circle") return edges[0].curve.center;
  if (edges.length !== 4 || !edges.every((edge) => edge.curve?.kind === "line")) return null;
  const points = edges.flatMap((edge) =>
    edge.curve?.kind === "line" ? [edge.curve.a, edge.curve.b] : [],
  );
  const unique = points.filter(
    (p, i) =>
      points.findIndex(
        (q) => new THREE.Vector3(...p).distanceTo(new THREE.Vector3(...q)) < 1e-6,
      ) === i,
  );
  if (unique.length !== 4) return null;
  const center = new THREE.Vector3();
  for (const point of unique) center.add(new THREE.Vector3(...point));
  center.multiplyScalar(0.25);
  const radii = unique.map((p) => center.distanceTo(new THREE.Vector3(...p)));
  if (Math.max(...radii) - Math.min(...radii) > 1e-6) return null;
  return center.toArray() as Vector;
}

function candidates(editor: SketchEditor): Vector[] {
  const points: Vector[] = [[0, 0, 0]];
  for (const sketch of editor.display.sketches) {
    if (!editor.visibility.visible(sketch.id)) continue;
    for (const hit of pointHits(sketch)) points.push(worldPoint(sketch.plane, hit.point));
  }
  if (!editor.bodiesVisible) return points;
  for (const body of editor.display.bodies ?? []) {
    if (!editor.visibility.visible(body.id)) continue;
    for (const edge of featureEdges(body)) {
      if (edge.curve?.kind === "circle") continue;
      if (edge.points.length >= 6)
        points.push(edge.points.slice(0, 3) as Vector, edge.points.slice(-3) as Vector);
    }
    for (const face of body.faces) {
      const center = faceCenter(body, face);
      if (center) points.push(center);
    }
  }
  return points;
}

function visible(editor: SketchEditor, point: Vector): boolean {
  if (!editor.bodiesVisible) return true;
  const camera = editor.world.camera;
  const p = new THREE.Vector3(...point),
    projected = p.clone().project(camera);
  const ray = new THREE.Raycaster();
  ray.setFromCamera(new THREE.Vector2(projected.x, projected.y), camera);
  const distance = p.clone().sub(ray.ray.origin).dot(ray.ray.direction);
  const a = new THREE.Vector3(),
    b = new THREE.Vector3(),
    c = new THREE.Vector3(),
    hit = new THREE.Vector3();
  const frame = editor.world.activeFrame;
  const clipNormal = frame
    ? new THREE.Vector3(...frame.u).cross(new THREE.Vector3(...frame.v))
    : null;
  const clipOrigin = frame ? new THREE.Vector3(...frame.origin) : null;
  const side =
    clipNormal && clipOrigin
      ? Math.sign(clipNormal.dot(camera.position.clone().sub(clipOrigin)))
      : 0;
  for (const body of editor.display.bodies ?? []) {
    if (!editor.visibility.visible(body.id)) continue;
    for (const face of body.faces)
      for (let i = 0; i < face.vertices.length; i += 9) {
        a.fromArray(face.vertices, i);
        b.fromArray(face.vertices, i + 3);
        c.fromArray(face.vertices, i + 6);
        if (!ray.ray.intersectTriangle(a, b, c, false, hit)) continue;
        if (clipNormal && clipOrigin && side * clipNormal.dot(hit.clone().sub(clipOrigin)) > 1e-4)
          continue;
        if (hit.clone().sub(ray.ray.origin).dot(ray.ray.direction) < distance - 1e-4) return false;
      }
  }
  return true;
}

/** Only genuine points of interest, never mesh tessellation vertices; screen-space priority. */
export function anchorSnap(
  editor: SketchEditor,
  screen: Point,
  plane?: { center: Vector; normal: Vector },
): Vector | null {
  const frame = editor.world.activeFrame;
  const normal = frame ? new THREE.Vector3(...frame.u).cross(new THREE.Vector3(...frame.v)) : null;
  const nearby = candidates(editor)
    .filter(
      (point) =>
        !plane ||
        Math.abs(
          new THREE.Vector3(...plane.normal).dot(
            new THREE.Vector3(...point).sub(new THREE.Vector3(...plane.center)),
          ),
        ) < 1e-6,
    )
    .filter(
      (point) =>
        !normal ||
        !frame ||
        Math.abs(normal.dot(new THREE.Vector3(...point).sub(new THREE.Vector3(...frame.origin)))) <
          1e-5,
    )
    .map((point) => {
      const p = editor.world.project(point);
      return {
        point,
        distance: Math.hypot(p.x - screen.x, p.y - screen.y),
        depth: new THREE.Vector3(...point).project(editor.world.camera).z,
      };
    })
    .filter((p) => p.distance <= 10)
    .sort((a, b) => a.distance - b.distance || a.depth - b.depth);
  return nearby.find((p) => visible(editor, p.point))?.point ?? null;
}
