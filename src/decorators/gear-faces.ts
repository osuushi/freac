import type { Face } from "../model/body.js";
import type { DisplayDocument } from "../model/display-document.js";
import { cross, dot, sameCylinder, subtract } from "./cylinder.js";
import type { FaceReference } from "./types.js";

export function gearFaces(document: DisplayDocument, refs: readonly FaceReference[]): Face[] {
  if (!refs.length) throw new Error("Select cylindrical, conic or planar pitch faces for Gear");
  return refs.map((ref) => {
    const face = document.bodies
      ?.find((b) => b.id === ref.body)
      ?.faces.find((f) => f.id === ref.face);
    if (!face || (!face.cylinder && !face.plane && !face.cone))
      throw new Error("Gear requires analytic cylindrical, conic or planar pitch faces");
    return face;
  });
}

export function sameGearSupport(a: Face, b: Face): boolean {
  if (a.cylinder && b.cylinder) return sameCylinder(a.cylinder, b.cylinder);
  if (a.cone && b.cone)
    return (
      a.cone.outward === b.cone.outward &&
      Math.abs(a.cone.semiAngle - b.cone.semiAngle) < 1e-7 &&
      Math.hypot(...subtract(a.cone.apex, b.cone.apex)) < 1e-7 &&
      dot(a.cone.axis, b.cone.axis) > 1 - 1e-10
    );
  if (a.plane && b.plane) {
    const normal = cross(a.plane.u, a.plane.v),
      other = cross(b.plane.u, b.plane.v);
    return (
      dot(normal, other) > 1 - 1e-10 &&
      Math.abs(dot(normal, subtract(a.plane.origin, b.plane.origin))) < 1e-7
    );
  }
  return false;
}
