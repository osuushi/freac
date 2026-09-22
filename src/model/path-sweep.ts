import type { Vector } from "../sketch/planes.js";
import type { BooleanMode, LiftSource } from "./body.js";

/** World-space mathematical curves; never saved as document path entities. */
export type PathSegment =
  | { kind: "line"; a: Vector; b: Vector }
  | { kind: "bezier"; a: Vector; c1: Vector; c2: Vector; b: Vector };
export interface PathSweep {
  sources: LiftSource[];
  path: PathSegment[];
  mode: BooleanMode | "auto";
  targets?: string[];
  eligibleTargets?: string[];
}
