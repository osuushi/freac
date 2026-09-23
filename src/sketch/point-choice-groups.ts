import type { PointReference, Sketch } from "./document.js";
import { coincidentPoints } from "./line-edit.js";
import { type Hit, pointKey } from "./picking.js";
import { endpointKey } from "./point-links.js";

function reference(hit: Hit): PointReference | null {
  if (hit.kind === "endpoint") return hit.endpoint;
  if (hit.kind === "circleCenter") return { curve: hit.curve, end: "center" };
  return null;
}

/** One choice per stored coincidence component, preserving the menu's order. */
export function pointChoiceGroups(sketch: Sketch, hits: readonly Hit[]): Hit[][] {
  const seen = new Set<string | null>();
  const groups: Hit[][] = [];
  for (const hit of hits) {
    if (seen.has(pointKey(hit))) continue;
    const ref = reference(hit);
    const linked = new Set(ref ? coincidentPoints(sketch, ref).map(endpointKey) : []);
    const group = hits.filter((candidate) => {
      const candidateRef = reference(candidate);
      return candidate === hit || (candidateRef && linked.has(endpointKey(candidateRef)));
    });
    for (const member of group) seen.add(pointKey(member));
    groups.push(group);
  }
  return groups;
}
