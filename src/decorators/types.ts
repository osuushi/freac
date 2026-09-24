import type { ExportMesh } from "../model/export-mesh.js";
import type { PlaneFrame } from "../sketch/planes.js";

export type Settings = Record<string, string | number | boolean>;
export interface FaceReference {
  body: string;
  face: string;
}
export interface DecoratorInstance {
  readonly id: string;
  readonly definition: string;
  readonly version: number;
  readonly faces: readonly FaceReference[];
  readonly settings: Settings;
  /** Persistent local coordinates keep a helix continuous across face changes. */
  readonly frame: PlaneFrame;
  readonly problem?: string;
}
export interface DecoratorField {
  key: string;
  label: string;
  type: "number" | "enum";
  unit?: string;
  min?: number;
  max?: number;
  options?: readonly { value: string; label: string }[];
}
export interface MeshModification {
  operation: "add" | "subtract";
  mesh: ExportMesh;
}
export type DecoratorEdit =
  | { action: "apply"; definition: string; faces: FaceReference[]; settings?: Settings }
  | { action: "settings"; ids: string[]; patch: Settings }
  | { action: "continue"; id: string; faces: FaceReference[] }
  | { action: "reassign"; id: string; faces: FaceReference[] }
  | { action: "discard"; id: string }
  | { action: "remove"; faces: FaceReference[] };
