import * as THREE from "three";
import type { Body } from "../model/body.js";
import {
  clipOrbitPolygon,
  hasOrbitSurfaceArea,
  nearestOrbitSegment,
  orbitBodyBox,
  orbitClipPlanes,
  orbitScreenPoint,
  projectedOrbitBox,
} from "./orbit-projection.js";

/** Return the frontmost rendered surface at a ray; bounds keep unrelated bodies out of triangle tests. */
export function orbitSurfaceHit(
  camera: THREE.OrthographicCamera,
  bodies: readonly Body[],
  ndc: THREE.Vector2,
  planes: readonly THREE.Plane[],
): THREE.Vector3 | null {
  const caster = new THREE.Raycaster();
  caster.setFromCamera(ndc, camera);
  const ray = caster.ray;
  const a = new THREE.Vector3(),
    b = new THREE.Vector3(),
    c = new THREE.Vector3(),
    hit = new THREE.Vector3();
  let nearest: THREE.Vector3 | null = null,
    distance = Infinity;
  for (const body of bodies) {
    if (!ray.intersectsBox(orbitBodyBox(body.bounds).expandByScalar(1e-7))) continue;
    for (const face of body.faces)
      for (let i = 0; i < face.vertices.length; i += 9) {
        a.fromArray(face.vertices, i);
        b.fromArray(face.vertices, i + 3);
        c.fromArray(face.vertices, i + 6);
        if (
          !ray.intersectTriangle(a, b, c, false, hit) ||
          planes.some((p) => p.distanceToPoint(hit) < -1e-8)
        )
          continue;
        const depth = hit.distanceToSquared(ray.origin);
        if (depth < distance) {
          nearest = hit.clone();
          distance = depth;
        }
      }
  }
  return nearest;
}

/** Nearest projected surface, then a fresh ray resolves occlusion at that screen location. */
export function nearestOrbitSurface(
  camera: THREE.OrthographicCamera,
  bodies: readonly Body[],
  ndc: THREE.Vector2,
  aspect: number,
  clipping: readonly THREE.Plane[],
): THREE.Vector3 | null {
  const planes = orbitClipPlanes(camera, clipping);
  const direct = orbitSurfaceHit(camera, bodies, ndc, planes);
  if (direct) return direct;
  const pointer = new THREE.Vector2(ndc.x * aspect, ndc.y);
  const direction = camera.getWorldDirection(new THREE.Vector3());
  const viewport = new THREE.Box2(new THREE.Vector2(-aspect, -1), new THREE.Vector2(aspect, 1));
  const candidates = bodies
    .map((body) => {
      const box = projectedOrbitBox(orbitBodyBox(body.bounds), camera, aspect).intersect(viewport);
      return { body, distance: box.isEmpty() ? Infinity : box.distanceToPoint(pointer) ** 2 };
    })
    .sort((a, b) => a.distance - b.distance);
  let best: { point: THREE.Vector3; inside: THREE.Vector3; distance: number } | null = null;
  for (const { body, distance } of candidates) {
    if (!Number.isFinite(distance) || distance > (best?.distance ?? Infinity) + 1e-12) break;
    for (const face of body.faces)
      for (let i = 0; i < face.vertices.length; i += 9) {
        const polygon = clipOrbitPolygon(
          [0, 3, 6].map((o) => new THREE.Vector3().fromArray(face.vertices, i + o)),
          planes,
        );
        if (!hasOrbitSurfaceArea(polygon, direction)) continue;
        for (let j = 0; j < polygon.length; j++) {
          const candidate = nearestOrbitSegment(
            polygon[j],
            polygon[(j + 1) % polygon.length],
            pointer,
            camera,
            aspect,
          );
          if (candidate.distance >= (best?.distance ?? Infinity)) continue;
          const inside = polygon
            .reduce((sum, p) => sum.add(p), new THREE.Vector3())
            .divideScalar(polygon.length);
          best = { ...candidate, inside };
        }
      }
  }
  if (!best) return null;
  // Move a subpixel amount into the winning polygon, avoiding unstable rays exactly on triangle boundaries.
  const screen = orbitScreenPoint(best.point, camera, aspect),
    inside = orbitScreenPoint(best.inside, camera, aspect);
  const distance = screen.distanceTo(inside);
  if (distance) screen.lerp(inside, Math.min(1, 1e-7 / distance));
  const hit = orbitSurfaceHit(
    camera,
    bodies,
    new THREE.Vector2(screen.x / aspect, screen.y),
    planes,
  );
  return hit;
}
