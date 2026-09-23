import * as THREE from "three";
import { boundaryPoints } from "../sketch/curve-spans.js";
import { type PlaneFrame, worldPoint } from "../sketch/planes.js";
import type { Profile } from "../sketch/profiles.js";
import { stableClipping } from "../sketch/stable-clipping.js";

export function sectionMesh(profile: Profile, frame: PlaneFrame, scale: number) {
  const outer = boundaryPoints(profile.outer, scale);
  const holes = profile.holes.map((h) => boundaryPoints(h, scale));
  const points = [...outer, ...holes.flat()];
  const vector = (p: { x: number; y: number }) => new THREE.Vector2(p.x, p.y);
  const positions: number[] = [];
  for (const triangle of THREE.ShapeUtils.triangulateShape(
    outer.map(vector),
    holes.map((h) => h.map(vector)),
  ))
    for (const i of triangle) positions.push(...worldPoint(frame, points[i]));
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  const material = stableClipping(
    new THREE.MeshBasicMaterial({
      color: "#b5c3cf",
      side: THREE.DoubleSide,
      polygonOffset: true,
      polygonOffsetFactor: 1,
      polygonOffsetUnits: 1,
      // Actual coplanar faces mark bit 4. Exclude those samples entirely instead
      // of relying on depth bias between different coplanar triangulations.
      // Write only the solid-silhouette bit (2), also masking reference fills.
      stencilWrite: true,
      stencilRef: 6,
      stencilFuncMask: 4,
      stencilWriteMask: 2,
      stencilFunc: THREE.NotEqualStencilFunc,
      stencilZPass: THREE.ReplaceStencilOp,
    }),
  );
  const mesh = new THREE.Mesh(geometry, material);
  mesh.renderOrder = 1;
  return mesh;
}
