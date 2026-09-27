import * as THREE from "three";

/** Clip geometry before nearest-screen queries so invisible portions cannot attract the pivot. */
export function clipOrbitPolygon(
  points: THREE.Vector3[],
  planes: readonly THREE.Plane[],
): THREE.Vector3[] {
  let polygon = points;
  for (const plane of planes) {
    const next: THREE.Vector3[] = [];
    for (let i = 0; i < polygon.length; i++) {
      const a = polygon[i],
        b = polygon[(i + 1) % polygon.length];
      const da = plane.distanceToPoint(a),
        db = plane.distanceToPoint(b);
      if (da >= 0) next.push(a);
      if (da >= 0 !== db >= 0) next.push(a.clone().lerp(b, da / (da - db)));
    }
    polygon = next;
    if (!polygon.length) break;
  }
  return polygon;
}

export function orbitClipPlanes(
  camera: THREE.OrthographicCamera,
  clipping: readonly THREE.Plane[],
): THREE.Plane[] {
  const matrix = camera.projectionMatrix.clone().multiply(camera.matrixWorldInverse);
  return [...new THREE.Frustum().setFromProjectionMatrix(matrix).planes, ...clipping];
}

/** Edge-on or degenerate polygons have no visible surface for a camera ray to hit. */
export function hasOrbitSurfaceArea(
  polygon: readonly THREE.Vector3[],
  direction: THREE.Vector3,
): boolean {
  if (polygon.length < 3) return false;
  const normal = new THREE.Vector3();
  for (let i = 1; i + 1 < polygon.length; i++) {
    normal.add(
      polygon[i]
        .clone()
        .sub(polygon[0])
        .cross(polygon[i + 1].clone().sub(polygon[0])),
    );
  }
  return Math.abs(normal.dot(direction)) > normal.length() * 1e-12;
}

export function orbitScreenPoint(
  point: THREE.Vector3,
  camera: THREE.OrthographicCamera,
  aspect: number,
): THREE.Vector2 {
  const p = point.clone().project(camera);
  return new THREE.Vector2(p.x * aspect, p.y);
}

/** Orthographic projection is affine, so the screen parameter also interpolates the world edge. */
export function nearestOrbitSegment(
  a: THREE.Vector3,
  b: THREE.Vector3,
  pointer: THREE.Vector2,
  camera: THREE.OrthographicCamera,
  aspect: number,
): { point: THREE.Vector3; distance: number } {
  const from = orbitScreenPoint(a, camera, aspect),
    to = orbitScreenPoint(b, camera, aspect);
  const delta = to.sub(from);
  const t = THREE.MathUtils.clamp(
    pointer.clone().sub(from).dot(delta) / (delta.lengthSq() || 1),
    0,
    1,
  );
  return {
    point: a.clone().lerp(b, t),
    distance: from.addScaledVector(delta, t).distanceToSquared(pointer),
  };
}

export function orbitBodyBox(bounds: readonly number[]): THREE.Box3 {
  return new THREE.Box3(
    new THREE.Vector3(...bounds.slice(0, 3)),
    new THREE.Vector3(...bounds.slice(3, 6)),
  );
}

export function projectedOrbitBox(
  box: THREE.Box3,
  camera: THREE.OrthographicCamera,
  aspect: number,
): THREE.Box2 {
  const result = new THREE.Box2();
  for (const x of [box.min.x, box.max.x])
    for (const y of [box.min.y, box.max.y])
      for (const z of [box.min.z, box.max.z])
        result.expandByPoint(orbitScreenPoint(new THREE.Vector3(x, y, z), camera, aspect));
  return result;
}

export function clipOrbitSegment(
  a: THREE.Vector3,
  b: THREE.Vector3,
  planes: readonly THREE.Plane[],
): [THREE.Vector3, THREE.Vector3] | null {
  let start = 0,
    end = 1;
  for (const plane of planes) {
    const da = plane.distanceToPoint(a),
      db = plane.distanceToPoint(b);
    if (da < 0 && db < 0) return null;
    if (da < 0) start = Math.max(start, da / (da - db));
    if (db < 0) end = Math.min(end, da / (da - db));
  }
  return start > end ? null : [a.clone().lerp(b, start), a.clone().lerp(b, end)];
}
