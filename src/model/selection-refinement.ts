import { type ModelingTarget, modelingKey } from "../sketch/model-selection.js";
import type { Body } from "./body.js";
import { faceBoundaryEdges } from "./face-boundary.js";
import { expandedSelection, selectionContext } from "./selection-context.js";

export const refinements = [
  ["remove-edges", "Remove edges"],
  ["remove-faces", "Remove faces"],
  ["only-edges", "Only edges"],
  ["only-faces", "Only faces"],
  ["add-faces", "Add faces touching selected edges"],
  ["add-edges", "Add edges of selected faces"],
  ["bodies", "Select owning bodies"],
  ["boundary", "Select face boundary edges"],
  ["clear", "Clear selection"],
] as const;
export type Refinement = (typeof refinements)[number][0];

/** Selection edits use the kernel's published topology, never screen proximity. */
export function refineSelection(
  targets: readonly ModelingTarget[],
  bodies: readonly Body[],
  action: Refinement,
): ModelingTarget[] {
  if (action === "clear") return [];
  if (action !== "bodies")
    targets = expandedSelection(
      selectionContext(targets, { units: "mm", sketches: [], bodies: [...bodies] }),
    );
  if (action === "remove-edges") return targets.filter((t) => t.kind !== "edge");
  if (action === "remove-faces") return targets.filter((t) => t.kind !== "face");
  if (action === "only-edges") return targets.filter((t) => t.kind === "edge");
  if (action === "only-faces") return targets.filter((t) => t.kind === "face");
  if (action === "boundary")
    return faceBoundaryEdges(
      bodies,
      targets.filter((t) => t.kind === "face"),
    );
  const result: ModelingTarget[] = action === "bodies" ? [] : [...targets];
  const keys = new Set(result.map((t) => `${t.kind}:${modelingKey(t)}`));
  const add = (target: ModelingTarget) => {
    const key = `${target.kind}:${modelingKey(target)}`;
    if (!keys.has(key)) {
      result.push(target);
      keys.add(key);
    }
  };
  for (const target of targets) {
    if (target.kind !== "body" && target.kind !== "edge" && target.kind !== "face") continue;
    const body = bodies.find((b) => b.id === target.body);
    if (!body) continue;
    if (action === "bodies") add({ kind: "body", body: body.id });
    if (action === "add-faces" && target.kind === "edge")
      for (const face of body.faces)
        if (face.edges.includes(target.edge)) add({ kind: "face", body: body.id, face: face.id });
    if (action === "add-edges" && target.kind === "face")
      for (const edge of body.faces.find((f) => f.id === target.face)?.edges ?? [])
        add({ kind: "edge", body: body.id, edge });
  }
  return result;
}
