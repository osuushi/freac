import type { MeasurementTarget } from "../model/measurement.js";
import type { PlaneFrame, Vector } from "../sketch/planes.js";
import type { SelectionTarget } from "../sketch/selection-target.js";

export type InspectionCommand = "selection" | "inspect" | "render" | "select" | "faces" | "context";
export type InspectionTarget =
  | { kind: "tagged-group"; taggedGroup: string }
  | { kind: "plane"; plane: string }
  | MeasurementTarget
  | { kind: "body"; body: string }
  | { kind: "sketch"; sketch: string }
  | (SelectionTarget & { sketch: string });
export interface InspectionView {
  mode: "sketch" | "modeling";
  activeSketch: string | null;
  selection: InspectionTarget[];
  selectedPoints: { target: InspectionTarget; position: Vector }[];
  hidden: string[];
  bodiesVisible: boolean;
  camera: {
    projection: "orthographic";
    position: number[];
    target: number[];
    up: number[];
    height: number;
    width: number;
    near: number;
    far: number;
  };
  clipping: { kind: "visual"; plane: PlaneFrame; equations: number[][] } | null;
  image?: { data: string; width: number; height: number };
}
declare global {
  interface Window {
    freacInspection?: {
      onRequest(
        callback: (render: boolean, acquireScript?: boolean, selection?: string) => InspectionView,
      ): () => void;
    };
  }
}
