import * as THREE from "three";
import type { Body } from "../model/body.js";
import { displayPoints } from "./curve-geometry.js";
import type { Sketch } from "./document.js";
import { worldPoint } from "./planes.js";

/** Screen-coverage centroid: one nearest geometry hit per cell, independent of tessellation density. */
export function visibleOrbitCenter(
  camera: THREE.OrthographicCamera,
  bodies: readonly Body[],
  sketches: readonly Sketch[],
  visible: (point: THREE.Vector3) => boolean,
): THREE.Vector3 | null {
  const objects: (THREE.Mesh | THREE.Line)[] = [];
  const material = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });
  const lineMaterial = new THREE.LineBasicMaterial();
  const height = (camera.top - camera.bottom) / camera.zoom;
  const width = (camera.right - camera.left) / camera.zoom;
  const add = (points: number[], surface: boolean) => {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(points, 3));
    const object = surface
      ? new THREE.Mesh(geometry, material)
      : new THREE.Line(geometry, lineMaterial);
    object.updateMatrixWorld();
    objects.push(object);
  };
  for (const body of bodies) {
    for (const face of body.faces) add(face.vertices, true);
    for (const edge of body.edges) add(edge.points, false);
  }
  for (const sketch of sketches)
    for (const curve of sketch.curves)
      add(
        displayPoints(curve, height / 1000).flatMap((p) => worldPoint(sketch.plane, p)),
        false,
      );
  const ray = new THREE.Raycaster();
  // Half the cell diagonal covers thin edges between rays, including wide viewports.
  ray.params.Line.threshold = Math.hypot(width, height) * (0.1 / 21);
  const center = new THREE.Vector3();
  let count = 0;
  try {
    for (let y = -10; y <= 10; y++)
      for (let x = -10; x <= 10; x++) {
        ray.setFromCamera(new THREE.Vector2(x * (0.4 / 21), y * (0.4 / 21)), camera);
        const hit = ray.intersectObjects(objects, false).find((hit) => {
          const projected = hit.point.clone().project(camera);
          return (
            Math.abs(projected.x) <= 0.200001 &&
            Math.abs(projected.y) <= 0.200001 &&
            projected.z >= -1 &&
            projected.z <= 1 &&
            visible(hit.point)
          );
        });
        if (hit) {
          center.add(hit.point);
          count++;
        }
      }
    return count ? center.divideScalar(count) : null;
  } finally {
    for (const object of objects) object.geometry.dispose();
    material.dispose();
    lineMaterial.dispose();
  }
}
