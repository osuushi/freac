import type { ModelingTarget } from "../sketch/model-selection.js";
import type { Body } from "./body.js";

export interface CleanupSelection {
  body: string;
  whole: boolean;
  faces: string[];
  edges: string[];
}
export function cleanupSelection(targets: readonly ModelingTarget[]): CleanupSelection[] {
  const selected = new Map<string, CleanupSelection>();
  for (const target of targets) {
    if (target.kind !== "body" && target.kind !== "face" && target.kind !== "edge") continue;
    const entry = selected.get(target.body) ?? {
      body: target.body,
      whole: false,
      faces: [],
      edges: [],
    };
    if (target.kind === "body") entry.whole = true;
    if (target.kind === "face") entry.faces.push(target.face);
    if (target.kind === "edge") entry.edges.push(target.edge);
    selected.set(target.body, entry);
  }
  return [...selected.values()];
}
/** The operation's changed faces and edges seed cleanup; no recursive flood. */
export function operationCleanup(
  before: readonly Body[],
  after: readonly Body[],
): CleanupSelection[] {
  const faces = new Map(before.flatMap((b) => b.faces.map((f) => [f.id, f] as const)));
  const edges = new Map(before.flatMap((b) => b.edges.map((e) => [e.id, e] as const)));
  const survivingFaces = new Set(after.flatMap((b) => b.faces.map((f) => f.id)));
  const removedFaceEdges = new Set(
    before.flatMap((b) => b.faces.filter((f) => !survivingFaces.has(f.id)).flatMap((f) => f.edges)),
  );
  return after.flatMap((body) => {
    if (before.some((b) => b.id === body.id && b.brep === body.brep)) return [];
    const changedFaces = body.faces
      .filter((f) => {
        const old = faces.get(f.id);
        return !old || !sameSignature(old.signature, f.signature);
      })
      .map((f) => f.id);
    const changedEdges = body.edges
      .filter((e) => {
        const old = edges.get(e.id);
        return !old || removedFaceEdges.has(e.id) || !sameSignature(old.signature, e.signature);
      })
      .map((e) => e.id);
    return [{ body: body.id, whole: false, faces: changedFaces, edges: changedEdges }];
  });
}

function sameSignature(a: readonly number[], b: readonly number[]): boolean {
  return (
    a.length === b.length &&
    a.every((v, i) => Math.abs(v - b[i]) <= 1e-9 * Math.max(1, Math.abs(v)))
  );
}
