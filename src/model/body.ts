import type { PlaneFrame, Vector } from "../sketch/planes.js";

export interface Face {
  /** Oriented wire occurrences; a seam can use the same edge twice. */
  readonly edges: readonly string[];
  readonly id: string;
  readonly signature: number[];
  readonly vertices: number[];
  readonly plane: PlaneFrame | null;
  /** Tangent face closure required for a normal offset (distinct from blend resizing). */
  readonly offsetFaces?: readonly string[];
  readonly offsetHandle?: { center: Vector; normal: Vector } | null;
  /** Recognized current-geometry blend and its required tangent patches. */
  readonly blend?: { radius: number; outward: 1 | -1; faces: readonly string[] } | null;
  /** Derived analytic measurement; other surface classes remain ordinary faces. */
  readonly cylinder?: { origin: Vector; axis: Vector; radius: number; outward: 1 | -1 } | null;
}
export type EdgeCurve =
  | { kind: "line"; a: Vector; b: Vector }
  | { kind: "arc"; a: Vector; b: Vector; mid: Vector }
  | { kind: "circle"; center: Vector; normal: Vector; radius: number };
export interface Edge {
  readonly curve: EdgeCurve | null;
  readonly id: string;
  readonly signature: number[];
  readonly points: number[];
}
/** Exact shape is authoritative. Meshes and polylines are display derivatives. */
export interface Body {
  readonly id: string;
  readonly brep: string;
  readonly volume: number;
  readonly center: Vector;
  readonly bounds: number[];
  readonly faces: readonly Face[];
  readonly edges: readonly Edge[];
}
export type BooleanMode = "new" | "union" | "subtract" | "intersect";
export type LiftSource = { sketch: string; profile: string } | { face: string };
export type ExtrusionDraft = { mode: "angle" | "offset"; value: number };
export interface Extrusion {
  /** Signed distance is total cap-to-cap depth; source stays at the midplane. */
  symmetric?: boolean;
  draft?: ExtrusionDraft;
  /** Signed total degrees about the source normal, through an in-plane origin. */
  twist?: { angle: number; origin: Vector };
  sources: LiftSource[];
  distance: number;
  mode: BooleanMode | "auto";
  targets?: string[];
  /** UI-visible candidates; independent of explicit Boolean target selection. */
  eligibleTargets?: string[];
}

export interface BodyTransform {
  ids: string[];
  pivot: Vector;
  axis: Vector;
  angle: number;
  translation: Vector;
  duplicate: boolean;
}
export interface FaceMovement extends Omit<BodyTransform, "ids" | "duplicate"> {
  /** Disjoint complete bodies move rigidly within the same atomic edit. */
  bodyIds?: string[];
  faces: { body: string; face: string }[];
}

export interface EdgeMovement {
  bodyIds?: string[];
  edges: { body: string; edge: string }[];
  translation: Vector;
}

export interface BodyBoolean {
  ids: string[];
  mode: Exclude<BooleanMode, "new">;
  keepOriginals: boolean;
}

export interface BodyEdgeFinish {
  edges: { body: string; edge: string }[];
  size: number;
  mode: "fillet" | "chamfer";
}

export interface BodyFaceOffset {
  /** When present, rebuild a recognized blend at this radius instead of normal offset. */
  radius?: number;
  faces: { body: string; face: string }[];
  distance: number;
}

/** Temporary screw sweep inputs; accepted bodies retain only materialized geometry. */
export interface Revolution {
  sources: LiftSource[];
  axis: { origin: Vector; direction: Vector };
  angle: number;
  height: number;
  mode: BooleanMode | "auto";
  targets?: string[];
  /** UI-visible candidates; independent of explicit Boolean target selection. */
  eligibleTargets?: string[];
}

export interface BodyShell {
  selection: { body: string; faces: string[] }[];
  /** Signed distance: negative inward, positive outward. Empty faces means closed hollow. */
  thickness: number;
}
