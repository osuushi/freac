import * as THREE from "three";
import type { SketchEditor } from "../sketch/editor.js";
import type { Point, Vector } from "../sketch/planes.js";
import type { Body, Face } from "./body.js";
import { featureEdges } from "./feature-edges.js";

export function screenRay(editor: SketchEditor, screen: Point): THREE.Ray {
  const rect = editor.world.canvas.getBoundingClientRect(),
    caster = new THREE.Raycaster();
  caster.setFromCamera(
    new THREE.Vector2(
      ((screen.x - rect.left) / rect.width) * 2 - 1,
      1 - ((screen.y - rect.top) / rect.height) * 2,
    ),
    editor.world.camera,
  );
  return caster.ray;
}
export function faceRayHits(
  bodies: readonly Body[],
  ray: THREE.Ray,
  camera: THREE.Vector3,
  clipping: readonly THREE.Plane[] = [],
) {
  const hits: { body: string; face: string; depth: number }[] = [];
  const a = new THREE.Vector3(),
    b = new THREE.Vector3(),
    c = new THREE.Vector3(),
    hit = new THREE.Vector3();
  for (const body of bodies)
    for (const face of body.faces) {
      let depth = Infinity;
      for (let i = 0; i < face.vertices.length; i += 9) {
        a.fromArray(face.vertices, i);
        b.fromArray(face.vertices, i + 3);
        c.fromArray(face.vertices, i + 6);
        if (
          ray.intersectTriangle(a, b, c, true, hit) &&
          clipping.every((p) => p.distanceToPoint(hit) >= 0)
        )
          depth = Math.min(depth, hit.distanceTo(camera));
      }
      if (Number.isFinite(depth)) hits.push({ body: body.id, face: face.id, depth });
    }
  return hits.sort((a, b) => a.depth - b.depth);
}
/** Curved faces need the normal next to this edge point, not a face-wide normal. */
export function edgeFacesCamera(
  body: Body,
  edge: string,
  point: Vector,
  direction: THREE.Vector3,
): boolean {
  return body.faces
    .filter((face) => face.edges.includes(edge))
    .some((face) => localFaceFacing(face, point, direction));
}
function localFaceFacing(face: Face, point: Vector, direction: THREE.Vector3): boolean {
  const triangle = new THREE.Triangle(),
    probe = new THREE.Vector3(...point),
    nearest = new THREE.Vector3();
  const normal = new THREE.Vector3();
  let distance = Infinity,
    front = false;
  for (let i = 0; i < face.vertices.length; i += 9) {
    triangle.a.fromArray(face.vertices, i);
    triangle.b.fromArray(face.vertices, i + 3);
    triangle.c.fromArray(face.vertices, i + 6);
    triangle.closestPointToPoint(probe, nearest);
    const d = nearest.distanceToSquared(probe);
    if (d > distance + 1e-10) continue;
    const facing = triangle.getNormal(normal).dot(direction) <= 1e-8;
    front = d < distance - 1e-10 ? facing : front || facing;
    distance = Math.min(distance, d);
  }
  return front;
}
export function edgeRayHits(editor: SketchEditor, screen: Point, bodies: readonly Body[]) {
  const ray = screenRay(editor, screen),
    camera = editor.world.camera.position;
  const hits: { body: string; edge: string; depth: number; point: Vector; distance: number }[] = [];
  for (const body of bodies)
    for (const edge of featureEdges(body)) {
      let best: (typeof hits)[number] | null = null;
      for (let i = 0; i + 3 < edge.points.length; i += 3) {
        const a = new THREE.Vector3().fromArray(edge.points, i),
          b = new THREE.Vector3().fromArray(edge.points, i + 3);
        const A = editor.world.project(a.toArray() as Vector),
          B = editor.world.project(b.toArray() as Vector);
        const dx = B.x - A.x,
          dy = B.y - A.y;
        const t = Math.max(
          0,
          Math.min(1, ((screen.x - A.x) * dx + (screen.y - A.y) * dy) / (dx * dx + dy * dy || 1)),
        );
        const distance = Math.hypot(screen.x - A.x - dx * t, screen.y - A.y - dy * t);
        if (distance > 7) continue;
        const point = a.lerp(b, t),
          depth = point.distanceTo(camera);
        if (!editor.world.visiblePoint(point)) continue;
        if (
          !best ||
          distance < best.distance - 0.1 ||
          (Math.abs(distance - best.distance) <= 0.1 && depth < best.depth)
        )
          best = {
            body: body.id,
            edge: edge.id,
            depth,
            distance,
            point: point.toArray() as Vector,
          };
      }
      if (best && edgeFacesCamera(body, edge.id, best.point, ray.direction)) hits.push(best);
    }
  return hits.sort((a, b) => a.depth - b.depth);
}
