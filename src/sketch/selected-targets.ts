import type { Sketch } from "./document.js";
import type { Hit } from "./picking.js";

export type PointTarget =
  | { readonly kind: "endpoint"; readonly curve: string; readonly end: "a" | "b" }
  | { readonly kind: "midpoint" | "curve-center"; readonly curve: string }
  | { readonly kind: "group-center"; readonly group: string }
  | {
      readonly kind: "group-handle";
      readonly group: string;
      readonly handle: "corner" | "edge";
      readonly index: number;
    };
export type SelectionTarget =
  | PointTarget
  | { readonly kind: "curve"; readonly curve: string }
  | { readonly kind: "group"; readonly group: string };
export function targetKey(target: SelectionTarget): string {
  switch (target.kind) {
    case "curve":
      return target.curve;
    case "group":
      return `${target.group}/group`;
    case "endpoint":
      return `${target.curve}/${target.end}`;
    case "midpoint":
      return `${target.curve}/midpoint`;
    case "curve-center":
      return `${target.curve}/center`;
    case "group-center":
      return `${target.group}/center`;
    case "group-handle":
      return `${target.group}/${target.handle}/${target.index}`;
  }
}
export function pointTarget(hit: Hit): PointTarget | null {
  if (hit.kind === "endpoint") return { kind: "endpoint", ...hit.endpoint };
  if (hit.kind === "midpoint") return { kind: "midpoint", curve: hit.curve };
  if (hit.kind === "circleCenter") return { kind: "curve-center", curve: hit.curve };
  if (hit.kind === "center") return { kind: "group-center", group: hit.group.id };
  if (hit.kind === "handle")
    return {
      kind: "group-handle",
      group: hit.group.id,
      handle: hit.handle.kind,
      index: hit.handle.index,
    };
  return null;
}
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
