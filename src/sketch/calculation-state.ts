import type { ModelRequest } from "./model-api.js";

/** Calculation can be discarded before acceptance; an explicit Accept completes normally. */
export function cancellableCalculation(kind: ModelRequest["kind"]): boolean {
  return [
    "preview",
    "mirror",
    "scale",
    "plane-cut",
    "check-plane-cut",
    "extrude",
    "revolve",
    "offset-faces",
    "shell",
    "move-faces",
    "move-edges",
    "finish-edges",
    "edge-finish-selection",
    "boolean-bodies",
    "project",
    "cleanup",
    "check-cleanup",
    "delete-topology",
    "delete-entities",
    "transform-bodies",
    "open",
  ].includes(kind);
}

export function calculationLabel(kind: ModelRequest["kind"] | undefined): string {
  switch (kind) {
    case "delete-topology":
      return "Deleting faces and edges";
    case "delete-entities":
      return "Deleting geometry";
    case "shell":
      return "Calculating shell";
    case "open":
      return "Opening document";
    case "preview":
    case "edit":
      return "Solving sketch";
    case "accept":
      return "Completing edit";
    default:
      return "Calculating geometry";
  }
}
