import type { Manifold } from "manifold-3d";
import type { Body, Face } from "../model/body.js";
import type { Vector } from "../sketch/planes.js";
import { trimAdjacentCylinders } from "./curved-domain.js";
import { cross, dot, subtract } from "./cylinder.js";
import type { MeshScope } from "./mesh-scope.js";
import type { threadMeshes } from "./thread-mesh.js";

/** Bound each selected patch independently; disjoint axial patches must not clip each other. */
function trimAdjacentPlanes(scope: MeshScope, solid: Manifold, face: Face, body: Body): Manifold {
  let result = solid;
  for (const adjacent of body.faces) {
    if (!adjacent.plane || !adjacent.edges.some((edge) => face.edges.includes(edge))) continue;
    const normal = cross(adjacent.plane.u, adjacent.plane.v);
    let low = Infinity,
      high = -Infinity;
    for (let i = 0; i < face.vertices.length; i += 3) {
      const distance = dot(
        normal,
        subtract(face.vertices.slice(i, i + 3) as Vector, adjacent.plane.origin),
      );
      low = Math.min(low, distance);
      high = Math.max(high, distance);
    }
    // A nonconvex domain can straddle an adjacent plane; its trimmed mask remains authoritative.
    if (low < -1e-7 && high > 1e-7) continue;
    const side = high > 1e-7 ? 1 : low < -1e-7 ? -1 : 0;
    if (!side) continue;
    const inward = normal.map((v) => v * side) as Vector;
    result = scope.keep(
      result.trimByPlane(inward, dot(inward, subtract(adjacent.plane.origin, scope.origin))),
    );
  }
  return result;
}

export function threadDomain(
  scope: MeshScope,
  body: Body,
  faces: readonly Face[],
  geometry: NonNullable<ReturnType<typeof threadMeshes>>,
): Manifold {
  const band = scope.from(geometry.band);
  if (!geometry.masks) return band;
  const patches = geometry.masks.map((mesh, i) =>
    trimAdjacentCylinders(
      scope,
      trimAdjacentPlanes(scope, scope.keep(scope.from(mesh).intersect(band)), faces[i], body),
      faces[i],
      body,
      geometry.tolerance,
    ),
  );
  return patches.slice(1).reduce((all, patch) => scope.keep(all.add(patch)), patches[0]);
}
