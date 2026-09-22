import type { Vector } from "../sketch/planes.js";
import type { BodyEdgeFinish, BodyFaceOffset } from "./body.js";

export type ScaleSource =
  | { kind: "curves"; sketchId: string; ids: string[] }
  | { kind: "sketches"; ids: string[] }
  | {
      kind: "solids";
      ids: string[];
      faces: BodyFaceOffset["faces"];
      edges: BodyEdgeFinish["edges"];
    };
export type ScaleOperation = ScaleSource & { pivot: Vector; factor: number };

export function scalePoint(point: Vector, pivot: Vector, factor: number): Vector {
  return point.map((value, i) => pivot[i] + factor * (value - pivot[i])) as Vector;
}
export function validateScale(operation: ScaleOperation): void {
  if (!Number.isFinite(operation.factor) || operation.factor <= 0)
    throw new Error("Enter a positive scale factor");
  if (
    !Array.isArray(operation.pivot) ||
    operation.pivot.length !== 3 ||
    !operation.pivot.every(Number.isFinite)
  )
    throw new Error("Choose a finite scale pivot");
}
