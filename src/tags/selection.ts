import type { ModelingTarget } from "../sketch/model-selection-state.js";
import type { TaggedGroup, TagMember } from "./model.js";

export function tagTargets(
  group: TaggedGroup,
): Extract<ModelingTarget, { kind: "face" | "edge" }>[] {
  return group.members.map((m) =>
    m.kind === "face"
      ? { kind: "face", body: group.body, face: m.id }
      : { kind: "edge", body: group.body, edge: m.id },
  );
}
export function tagMembers(targets: readonly ModelingTarget[]): TagMember[] {
  return targets.flatMap<TagMember>((t) =>
    t.kind === "face"
      ? [{ kind: "face" as const, id: t.face }]
      : t.kind === "edge"
        ? [{ kind: "edge" as const, id: t.edge }]
        : [],
  );
}
export function tagSelectionBody(targets: readonly ModelingTarget[]): string | null {
  if (!targets.length || targets.some((t) => t.kind !== "face" && t.kind !== "edge")) return null;
  const ids = new Set(targets.map((t) => ("body" in t ? t.body : null)));
  return ids.size === 1 ? ([...ids][0] ?? null) : null;
}
