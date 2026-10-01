import type { Sketch } from "./document.js";
import { resolvePointTargets } from "./point-query.js";
import { type PointTarget, type SelectionTarget, targetKey } from "./selection-target.js";

export class SelectedTargets {
  private value: readonly SelectionTarget[] = [];
  get targets(): readonly SelectionTarget[] {
    return this.value;
  }
  replace(targets: readonly SelectionTarget[]): void {
    const seen = new Set<string>();
    this.value = targets
      .filter((target) => {
        const key = targetKey(target);
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .map((target) => ({ ...target }));
  }
  get points(): readonly PointTarget[] {
    return this.value.filter(
      (target): target is PointTarget => target.kind !== "curve" && target.kind !== "group",
    );
  }
  get pointKeys(): Set<string> | null {
    return this.points.length ? new Set(this.points.map(targetKey)) : null;
  }
  get firstPointKey(): string | null {
    const first = this.points[0];
    return first ? targetKey(first) : null;
  }
  pointHits(sketch: Sketch | undefined) {
    return sketch ? resolvePointTargets(sketch, this.points) : [];
  }
  wholeCurves(sketch: Sketch | undefined): Set<string> {
    return new Set(
      this.value.flatMap((target) =>
        target.kind === "curve"
          ? [target.curve]
          : target.kind === "group"
            ? (sketch?.groups.find((g) => g.id === target.group)?.members ?? [])
            : [],
      ),
    );
  }
  replacePoints(points: readonly PointTarget[]): void {
    this.replace([
      ...this.value.filter((target) => target.kind === "curve" || target.kind === "group"),
      ...points,
    ]);
  }
  orderedKeys(sketch: Sketch | undefined): string[] {
    return this.value.flatMap((target) =>
      target.kind === "group"
        ? (sketch?.groups.find((g) => g.id === target.group)?.members ?? [])
        : [targetKey(target)],
    );
  }
}
