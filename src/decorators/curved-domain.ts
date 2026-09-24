import type { Manifold, Mat4 } from "manifold-3d";
import type { Body, Face } from "../model/body.js";
import type { Vector } from "../sketch/planes.js";
import { cross, cylinderFrame, dot, sameCylinder, subtract } from "./cylinder.js";
import type { MeshScope } from "./mesh-scope.js";

/** Extend an adjacent analytic boundary only when the entire selected patch lies
 * on its material side. Nonconvex patches keep their original trimmed mask. */
export function trimAdjacentCylinders(
  scope: MeshScope,
  solid: Manifold,
  face: Face,
  body: Body,
  tolerance: number,
): Manifold {
  let result = solid;
  for (const adjacent of body.faces) {
    const cylinder = adjacent.cylinder;
    if (
      !cylinder ||
      adjacent.id === face.id ||
      (face.cylinder && sameCylinder(cylinder, face.cylinder)) ||
      !adjacent.edges.some((e) => face.edges.includes(e))
    )
      continue;
    const frame = cylinderFrame(cylinder);
    const axis = cross(frame.u, frame.v);
    let materialSide = true;
    for (let i = 0; i < face.vertices.length; i += 3) {
      const delta = subtract(face.vertices.slice(i, i + 3) as Vector, frame.origin);
      const radius = Math.hypot(dot(delta, frame.u), dot(delta, frame.v));
      if ((radius - cylinder.radius) * cylinder.outward > 1e-6) {
        materialSide = false;
        break;
      }
    }
    if (!materialSide) continue;
    const bounds = result.boundingBox();
    const localOrigin = subtract(frame.origin, scope.origin);
    const depths: number[] = [];
    for (const x of [bounds.min[0], bounds.max[0]])
      for (const y of [bounds.min[1], bounds.max[1]])
        for (const z of [bounds.min[2], bounds.max[2]])
          depths.push(dot(subtract([x, y, z], localOrigin), axis));
    const low = Math.min(...depths) - tolerance;
    const height = Math.max(...depths) - low + tolerance;
    const segments = Math.max(
      32,
      Math.ceil(Math.PI / Math.acos(1 / (1 + tolerance / (2 * cylinder.radius)))),
    );
    // Circumscribe holes and inscribe exterior limits; neither introduces material
    // beyond the analytic boundary, and radial deviation stays below tolerance/2.
    const radius =
      cylinder.outward < 0 ? cylinder.radius / Math.cos(Math.PI / segments) : cylinder.radius;
    const primitive = scope.keep(scope.runtime.Manifold.cylinder(height, radius, radius, segments));
    const origin = localOrigin.map((n, i) => n + low * axis[i]);
    const matrix = [...frame.u, 0, ...frame.v, 0, ...axis, 0, ...origin, 1] as Mat4;
    const limit = scope.keep(primitive.transform(matrix));
    result = scope.keep(cylinder.outward < 0 ? result.subtract(limit) : result.intersect(limit));
  }
  return result;
}
