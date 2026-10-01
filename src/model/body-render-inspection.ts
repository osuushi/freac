import type * as THREE from "three";

/** Read-only drawable diagnostics; UUIDs identify current GPU resources, never model entities. */
export function inspectBodyRendering(scene: THREE.Scene) {
  const faces: {
    body: string;
    face: string;
    mesh: string;
    geometry: string;
    color: string;
    visible: boolean;
    stencil: number;
  }[] = [];
  let created = 0,
    disposed = 0;
  scene.traverse((object) => {
    const stats = object.userData.bodyDrawableStats;
    if (stats) {
      created += stats.created;
      disposed += stats.disposed;
    }
    const target = object.userData.bodyFace;
    if (!target) return;
    const mesh = object as THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>;
    let visible = true;
    for (let owner: THREE.Object3D | null = object; owner; owner = owner.parent)
      visible &&= owner.visible;
    faces.push({
      body: target.body,
      face: target.face,
      mesh: mesh.uuid,
      geometry: mesh.geometry.uuid,
      color: mesh.material.color.getHexString(),
      visible,
      stencil: mesh.material.stencilRef,
    });
  });
  return { faces, created, disposed };
}
