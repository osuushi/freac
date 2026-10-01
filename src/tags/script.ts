import type { BodyTransform } from "../model/body.js";
import type { TagEdit, TaggedGroup } from "./model.js";

export type TaggedOperation =
  | { kind: "offsetFaces"; distance: number }
  | {
      kind: "moveFaces";
      translation: BodyTransform["translation"];
      pivot: BodyTransform["pivot"];
      axis: BodyTransform["axis"];
      angle: number;
    }
  | { kind: "finishEdges"; mode: "fillet" | "chamfer"; size: number }
  | { kind: "shell"; thickness: number }
  | { kind: "scale"; pivot: BodyTransform["pivot"]; factor: number };
export interface TagScriptApi {
  taggedGroups(): Promise<readonly TaggedGroup[]>;
  editTaggedGroup(input: TagEdit): Promise<readonly TaggedGroup[]>;
  /** Resolve current membership atomically. Incompatible member types reject. */
  applyTaggedGroup(input: {
    id: string;
    operation: TaggedOperation;
  }): Promise<import("../agent-script/api.js").SolidResult>;
}
export type TagScriptOperation =
  | { kind: "taggedGroups"; input: Record<string, never> }
  | { kind: "editTaggedGroup"; input: TagEdit }
  | { kind: "applyTaggedGroup"; input: { id: string; operation: TaggedOperation } };
