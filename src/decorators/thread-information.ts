import type { Body } from "../model/body.js";
import { cross, cylinderExtent, dot, resolveFaces, subtract } from "./cylinder.js";
import { threadReference } from "./thread-extent.js";
import { coarseMetric, threadSettings } from "./thread-settings.js";
import type { DecoratorInstance, FaceReference } from "./types.js";

export interface ThreadWarning {
  message: string;
  faces: readonly FaceReference[];
}

export function threadInformation(bodies: readonly Body[], instance: DecoratorInstance) {
  const faces = resolveFaces(bodies, instance.faces);
  const cylinder = faces[0].cylinder;
  const settings = threadSettings(instance.settings);
  const diameter = cylinder.radius * 2;
  const description = `Reference Ø${Number(diameter.toPrecision(10))} mm · ${settings.cut === "rod" ? "rod major" : "rod minor"} diameter${coarseMetric(diameter).listed ? "" : " · nonstandard diameter"}`;
  const body = bodies.find((b) => b.id === instance.faces[0].body);
  const warnings: ThreadWarning[] = [];
  if (!body) return { description, warnings };
  const depth = (settings.pitch * Math.sqrt(3) * 5) / 16;
  const extent = threadReference(bodies, instance);
  const low = extent[0] + settings.start,
    high = extent[1] - settings.end;
  for (const adjacent of body.faces) {
    if (faces.some((f) => f.id === adjacent.id)) continue;
    const other = adjacent.cylinder;
    if (
      other &&
      other.outward !== cylinder.outward &&
      Math.hypot(...cross(other.axis, cylinder.axis)) < 1e-7 &&
      Math.hypot(...cross(subtract(other.origin, cylinder.origin), cylinder.axis)) < 1e-7
    ) {
      const range = cylinderExtent(instance.frame, [adjacent]);
      const removal =
        cylinder.outward === 1
          ? settings.cut === "rod"
            ? depth
            : 0
          : (settings.cut === "hole" ? depth : 0) + settings.clearance;
      const wall = (cylinder.radius - other.radius) * cylinder.outward;
      if (wall > 0 && removal >= wall && range[1] > low && range[0] < high)
        warnings.push({
          message: "Thread depth or hole relief may pierce this nearby wall.",
          faces: [...instance.faces, { body: body.id, face: adjacent.id }],
        });
    }
    if (
      cylinder.outward !== -1 ||
      !adjacent.plane ||
      !adjacent.edges.some((edge) => faces.some((f) => f.edges.includes(edge)))
    )
      continue;
    const normal = cross(adjacent.plane.u, adjacent.plane.v);
    const distance = Math.abs(dot(normal, subtract(adjacent.plane.origin, cylinder.origin)));
    const envelope = cylinder.radius + (settings.cut === "hole" ? depth : 0);
    if (Math.abs(dot(normal, cylinder.axis)) < 1e-7 && distance < envelope - 1e-7)
      warnings.push({
        message:
          "This flat interrupts the circular passage; a round mating thread may not turn here.",
        faces: [...instance.faces, { body: body.id, face: adjacent.id }],
      });
  }
  return { description, warnings };
}
