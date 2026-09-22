import type { Sketch } from "../sketch/document.js";
import { changedTargets, type EditIntent } from "../sketch/edit-intent.js";
import { solverLayout } from "./solver-geometry.js";

export function intentTargets(target: Sketch, previous: Sketch | undefined, intent: EditIntent) {
  const layout = solverLayout(target);
  const present = new Set(layout.curves.map((c) => c.id));
  const requested = intent.kind === "direct" ? changedTargets(previous, target) : intent.targets;
  const points = requested.filter((p) => present.has(p.curve));
  const changed = new Set(points.map((p) => p.curve));
  // Radius edits can leave the stored endpoints/center unchanged.
  for (const curve of layout.curves) {
    const old = previous?.curves.find((c) => c.id === curve.id);
    if (curve.kind === "circle" && old?.kind === "circle" && curve.radius !== old.radius)
      changed.add(curve.id);
  }
  const moved = new Set(points.map(layout.pointIndex));
  const freeCenters = new Set<number>();
  if (intent.kind === "point" || intent.kind === "pair")
    for (const curve of layout.curves) {
      if (curve.kind !== "arc") continue;
      const i = layout.index(curve.id);
      if ((moved.has(i) || moved.has(i + 1)) && !moved.has(i + 2)) freeCenters.add(i + 2);
    }
  const exact = intent.kind === "point" || intent.kind === "pair" ? [] : [...moved];
  return { changed, moved, freeCenters, exact };
}
