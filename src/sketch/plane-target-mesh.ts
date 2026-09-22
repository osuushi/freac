import * as THREE from "three";
import {
  type PlaneFrame,
  type PlaneId,
  type Point,
  planeIds,
  planes,
  worldPoint,
} from "./planes.js";
import type { World } from "./world.js";

export const planeTargetHalfSize = 20;
const planeColor: Record<PlaneId, string> = {
  XY: "#8fa8c4",
  XZ: "#91b5a4",
  YZ: "#c2a27b",
};

export type PlaneTarget = {
  id: PlaneId;
  frame: PlaneFrame;
  group: THREE.Group;
  mesh: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
  button: HTMLButtonElement;
};

export function createPlaneTargets(world: World, overlay: HTMLElement): PlaneTarget[] {
  return planeIds.map((id) => {
    const frame = planes[id],
      u = new THREE.Vector3(...frame.u),
      v = new THREE.Vector3(...frame.v),
      normal = u.clone().cross(v).normalize(),
      geometry = new THREE.PlaneGeometry(planeTargetHalfSize * 2, planeTargetHalfSize * 2),
      material = new THREE.MeshBasicMaterial({
        color: planeColor[id],
        transparent: true,
        opacity: 0.224,
        side: THREE.DoubleSide,
        depthWrite: false,
      }),
      mesh = new THREE.Mesh(geometry, material),
      group = new THREE.Group();
    mesh.renderOrder = 8;
    group.add(mesh);
    group.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(u, v, normal));
    world.scene.add(group);
    const button = document.createElement("button");
    button.type = "button";
    button.className = "plane-label";
    button.dataset.planeTarget = id;
    button.dataset.hovered = "false";
    button.textContent = `Sketch on ${id}`;
    button.setAttribute("aria-label", `Sketch on ${id}`);
    button.title = `Sketch on ${id}`;
    overlay.append(button);
    return { id, frame, group, mesh, button };
  });
}

export function projectedTargetCorners(world: World, target: PlaneTarget): Point[] {
  return [
    { x: -planeTargetHalfSize, y: -planeTargetHalfSize },
    { x: planeTargetHalfSize, y: -planeTargetHalfSize },
    { x: planeTargetHalfSize, y: planeTargetHalfSize },
    { x: -planeTargetHalfSize, y: planeTargetHalfSize },
  ].map((corner) => world.project(worldPoint(target.frame, corner)));
}

export function disposePlaneTarget(world: World, target: PlaneTarget): void {
  target.button.remove();
  world.scene.remove(target.group);
  target.mesh.geometry.dispose();
  target.mesh.material.dispose();
}

export function planeTargetBaseColor(id: PlaneId): string {
  return planeColor[id];
}
