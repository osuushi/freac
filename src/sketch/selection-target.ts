import type { Hit } from "./sketch-hit.js";

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
