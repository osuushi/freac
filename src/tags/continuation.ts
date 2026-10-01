import type { BodyGeometry } from "../model/body.js";
import { topologyOrigins } from "../model/body-correspondence.js";
import type { DisplayDocument } from "../model/display-document.js";
import { newId, type SketchDocument } from "../sketch/document.js";
import type { TaggedGroup, TagMember, TagProblem } from "./model.js";

/** Conservative fallback: equal support type/orientation, measure and center.
 * These signatures are not proof of identity, so a unique match remains flagged. */
function sameSignature(a: readonly number[], b: readonly number[]): boolean {
  return (
    a.length === 6 &&
    b.length === 6 &&
    a[0] === b[0] &&
    a[1] === b[1] &&
    Math.abs(a[2] - b[2]) <= 1e-8 * Math.max(1, Math.abs(a[2])) &&
    a.slice(3).every((n, i) => Math.abs(n - b[i + 3]) <= 1e-7)
  );
}
function descendants(group: TaggedGroup, old: BodyGeometry, body: BodyGeometry): TaggedGroup {
  const origins = topologyOrigins.get(body);
  const members: TagMember[] = [];
  const problems = new Set<TagProblem>(group.problems);
  const matched = new Set<string>();
  for (const member of group.members) {
    const { kind, id } = member;
    const wanted = new Set(group.members.filter((m) => m.kind === kind).map((m) => m.id));
    const before = kind === "face" ? old.faces : old.edges;
    const after = kind === "face" ? body.faces : body.edges;
    const map = kind === "face" ? origins?.faces : origins?.edges;
    for (const item of after) {
      const predecessors = map?.get(item.id) ?? [];
      if (item.id !== id && !predecessors.includes(id)) continue;
      if (!members.some((m) => m.id === item.id)) members.push({ kind, id: item.id });
      matched.add(id);
      if (predecessors.some((source) => !wanted.has(source))) problems.add("expanded");
    }
    if (matched.has(id)) continue;
    const original = before.find((m) => m.id === id);
    if (!original) continue;
    const matches = after.filter(
      (m) =>
        !map?.get(m.id)?.length &&
        !members.some((existing) => existing.id === m.id) &&
        sameSignature(original.signature, m.signature),
    );
    // Reject ambiguous source matches as well as ambiguous result matches.
    if (
      matches.length !== 1 ||
      before.filter((m) => sameSignature(m.signature, matches[0].signature)).length !== 1
    )
      continue;
    members.push({ kind, id: matches[0].id });
    matched.add(id);
    problems.add("inferred");
  }
  if (group.members.some((m) => !matched.has(m.id))) problems.add("lost");
  return { ...group, body: body.id, members, problems: [...problems] };
}
/** Consume only this edit's correspondence, alongside the geometry acceptance. */
export function continueTags<T extends DisplayDocument>(source: SketchDocument, candidate: T): T {
  if (!source.taggedGroups?.length || source.bodies === candidate.bodies) return candidate;
  const groups: TaggedGroup[] = [];
  for (const group of source.taggedGroups) {
    const old = source.bodies?.find((b) => b.id === group.body);
    if (!old) continue;
    const owners = (candidate.bodies ?? []).filter(
      (b) =>
        b.id === old.id ||
        (!source.bodies?.some((previous) => previous === b) &&
          topologyOrigins.get(b)?.bodies.includes(old.id)),
    );
    const continued = owners.map((body) => ({
      body,
      group: body === old ? group : descendants(group, old, body),
    }));
    const replacements = continued.filter(
      ({ body }) => body !== old && !topologyOrigins.get(body)?.copy,
    );
    const split = !owners.includes(old) && replacements.length > 1;
    for (const item of continued) {
      if (item.body === old) {
        groups.push(group);
        continue;
      }
      const copied =
        !!topologyOrigins.get(item.body)?.copy || (item.body !== old && owners.includes(old));
      if (split && !item.group.members.length && replacements.some((r) => r.group.members.length))
        continue;
      groups.push({
        ...item.group,
        id: split || copied ? newId() : group.id,
        ...(split
          ? {
              splitFrom: group.id,
              problems: [...new Set([...item.group.problems, "split" as const])],
            }
          : {}),
      });
    }
  }
  return { ...candidate, taggedGroups: groups };
}
