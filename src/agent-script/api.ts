import type { InspectionTarget } from "../agent/inspection-protocol.js";
import type {
  BodyBoolean,
  BodyEdgeFinish,
  BodyFaceOffset,
  BodyShell,
  BodyTransform,
  Extrusion,
  Revolution,
} from "../model/body.js";
import type { PathSweep } from "../model/path-sweep.js";
import type { PlaneCut } from "../model/plane-cut.js";
import type { ScaleOperation } from "../model/scale.js";
import type { PlaneFrame, PlaneId, Point } from "../sketch/planes.js";

export type ScriptCurve =
  | { kind: "segment"; a: Point; b: Point }
  | { kind: "circle"; center: Point; radius: number }
  | { kind: "arc"; a: Point; b: Point; bulge: number }
  | { kind: "bezier"; a: Point; c1: Point; c2: Point; b: Point };
export interface SketchInput {
  plane: PlaneId | PlaneFrame;
  curves: ScriptCurve[];
}
export interface SketchResult {
  sketch: string;
  curves: string[];
  profiles: { sketch: string; profile: string }[];
}
export interface SolidResult {
  bodies: { id: string; volume: number; faces: string[]; edges: string[] }[];
}
export interface PlaneInput {
  id?: string;
  frame: PlaneFrame;
}
export interface PlaneResult {
  plane: string;
  frame: PlaneFrame;
}
export interface ScaleResult extends SolidResult {
  sketches: SketchResult[];
}
export type ScriptResult =
  | SketchResult
  | SolidResult
  | ScaleResult
  | PlaneResult
  | { removed: string };
/** All distances are mm, angles degrees. Await each call; parallel edits reject. */
export interface ScriptApi {
  /** Omit id to create; supply an existing plane id to reposition. Frames are copied. */
  constructionPlane(input: PlaneInput): Promise<PlaneResult>;
  deleteConstructionPlane(input: { id: string }): Promise<{ removed: string }>;
  splitBody(input: Omit<PlaneCut, "mode">): Promise<SolidResult>;
  imprint(input: Omit<PlaneCut, "mode">): Promise<SolidResult>;
  scale(input: ScaleOperation): Promise<ScaleResult>;
  /** Sweep an initially perpendicular section along connected smooth 3D curves. */
  sweep(input: PathSweep): Promise<SolidResult>;
  /** Ordered operands; subtract removes later bodies from the first. */
  booleanBodies(input: BodyBoolean): Promise<SolidResult>;
  /** Zero is a no-op. Unachievable sizes reject, never silently clamp. */
  finishEdges(input: BodyEdgeFinish): Promise<SolidResult>;
  /** Negative thickness hollows inward; empty opening faces means a closed hollow body. */
  shell(input: BodyShell): Promise<SolidResult>;
  /** Fixed at script start. Point selections never imply whole-curve selection. */
  readonly selection: readonly InspectionTarget[];
  /** Ordinary editable curves on an explicit plane; IDs assigned by Freac. */
  createSketch(input: SketchInput): Promise<SketchResult>;
  /** Extrude explicit closed profiles or planar faces using the ordinary solid kernel. */
  extrude(input: Extrusion): Promise<SolidResult>;
  /** Revolve or sweep helically: height is total axial travel, not pitch per turn. */
  revolve(input: Revolution): Promise<SolidResult>;
  /** Normal face offset. Unsupported or limited distances reject the whole script. */
  offsetFaces(input: BodyFaceOffset): Promise<SolidResult>;
  /** Rigid movement/rotation or duplication of explicit bodies. */
  transformBodies(input: BodyTransform): Promise<SolidResult>;
}
export type ScriptOperation =
  | { kind: "booleanBodies"; input: BodyBoolean }
  | { kind: "finishEdges"; input: BodyEdgeFinish }
  | { kind: "shell"; input: BodyShell }
  | { kind: "sweep"; input: PathSweep }
  | { kind: "constructionPlane"; input: PlaneInput }
  | { kind: "deleteConstructionPlane"; input: { id: string } }
  | { kind: "splitBody"; input: Omit<PlaneCut, "mode"> }
  | { kind: "imprint"; input: Omit<PlaneCut, "mode"> }
  | { kind: "scale"; input: ScaleOperation }
  | { kind: "createSketch"; input: SketchInput }
  | { kind: "extrude"; input: Extrusion }
  | { kind: "revolve"; input: Revolution }
  | { kind: "offsetFaces"; input: BodyFaceOffset }
  | { kind: "transformBodies"; input: BodyTransform };
export interface ScriptRequest {
  action: "begin" | "step" | "finish" | "cancel" | "poll";
  token?: string;
  name?: string;
  error?: string;
  operation?: ScriptOperation;
}
