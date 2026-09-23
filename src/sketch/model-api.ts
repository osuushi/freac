import type {
  BodyBoolean,
  BodyEdgeFinish,
  BodyFaceOffset,
  BodyShell,
  BodyTransform,
  BooleanMode,
  EdgeMovement,
  Extrusion,
  FaceMovement,
  Revolution,
} from "../model/body.js";
import type { CleanupSelection } from "../model/cleanup.js";
import type { Projection } from "../model/projection.js";
import type { Sketch, SketchDocument } from "./document.js";
import type { EditIntent } from "./edit-intent.js";

import type { OperationHistoryEntry } from "./operation-history.js";
import type { PlaneFrame } from "./planes.js";

export type ModelRequest =
  | { kind: "sections"; frame: PlaneFrame; bodies: string[] }
  | { kind: "selection"; changes: import("./history-selection.js").SelectionChanges }
  | { kind: "rename-entity"; id: string; name: string }
  | { kind: "reorder-entity"; id: string; beforeId: string | null }
  | { kind: "check-plane-cut"; operation: import("../model/plane-cut.js").PlaneCut }
  | { kind: "scale"; operation: import("../model/scale.js").ScaleOperation }
  | { kind: "plane-cut"; operation: import("../model/plane-cut.js").PlaneCut }
  | {
      kind: "construction-plane";
      plane: import("../model/construction-plane.js").ConstructionPlane;
    }
  | { kind: "delete-plane"; id: string }
  | { kind: "mirror"; operation: import("../model/mirror.js").MirrorOperation }
  | { kind: "measure"; targets: import("../model/measurement.js").MeasurementTarget[] }
  | { kind: "cancel-preview" }
  | { kind: "supersede-preview"; interrupt?: boolean }
  | { kind: "check-cleanup" | "read-history" }
  | { kind: "cleanup" | "delete-topology"; selection: CleanupSelection[] }
  | { kind: "accept"; cleanup?: boolean }
  | { kind: "project"; projection: Projection }
  | { kind: "open"; document: SketchDocument }
  | { kind: "transform-bodies"; transform: BodyTransform }
  | { kind: "move-edges"; operation: EdgeMovement }
  | { kind: "move-faces"; operation: FaceMovement }
  | { kind: "boolean-bodies"; operation: BodyBoolean }
  | { kind: "edge-finish-selection"; operation: Omit<BodyEdgeFinish, "size"> }
  | { kind: "shell"; operation: BodyShell }
  | { kind: "offset-faces"; operation: BodyFaceOffset }
  | { kind: "finish-edges"; operation: BodyEdgeFinish }
  | { kind: "revolve"; revolution: Revolution }
  | { kind: "extrude"; extrusion: Extrusion }
  | { kind: "place-sketch"; sketchId: string; frame: PlaneFrame; duplicate?: boolean }
  | { kind: "merge-sketches"; targetSketchId: string; sourceSketchIds: string[] }
  | {
      kind: "delete-entities";
      bodyIds: string[];
      sketchIds: string[];
      topology?: CleanupSelection[];
    }
  | { kind: "delete-sketch"; sketchId: string }
  | { kind: "read" | "discard" | "undo" | "redo" | "new" }
  | { kind: "preview" | "edit"; sketch: Sketch; intent?: EditIntent }
  | { kind: "remove" | "clear"; sketchId: string; ids?: string[] };
export interface ModelView {
  historySelection?: import("./history-selection.js").HistorySelection;
  planeCutAvailable?: boolean;
  data: SketchDocument;
  offsetDistance?: number;
  offsetSelection?: BodyFaceOffset["faces"];
  cleanupAvailable?: boolean;
  edgeSize?: number;
  edgeSelection?: BodyEdgeFinish["edges"];
  booleanMode?: BooleanMode;
  booleanTargets?: string[];
  canUndo: boolean;
  canRedo: boolean;
  candidate: SketchDocument | null;
  solveCount: number;
  solveMs: number;
}
export type ModelReply = {
  sections?: import("../model/sketch-section.js").SketchSection[];
  documentChanged?: boolean;
  view: ModelView;
  error?: string;
  history?: OperationHistoryEntry[];
  measurement?: import("../model/measurement.js").Measurement;
};
export type ModelCall = (request: ModelRequest) => Promise<ModelReply>;
