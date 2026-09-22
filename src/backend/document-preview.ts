import { type SketchDocument, withSketch } from "../sketch/document.js";
import type { ModelRequest } from "../sketch/model-api.js";
import { mirrorDocument } from "./mirror.js";
import type { NativeSolver } from "./native-solver.js";
import { cutWithPlane } from "./plane-cut.js";
import { projectDocument } from "./projection.js";
import { scaleDocument } from "./scale.js";
import type { SolidCalculator } from "./solid-calculator.js";
import { solveSketch } from "./solve-sketch.js";

export type PreviewRequest = Extract<
  ModelRequest,
  { kind: "preview" | "edit" | "mirror" | "project" | "scale" | "plane-cut" }
>;

/** Calculates a candidate; acceptance, history and cancellation remain with DocumentOwner. */
export async function previewDocument(
  source: SketchDocument,
  request: PreviewRequest,
  kernel: SolidCalculator,
  solver: NativeSolver,
): Promise<{ document: SketchDocument; count: number; ms: number }> {
  let document: SketchDocument;
  switch (request.kind) {
    case "scale":
      document = await scaleDocument(source, request.operation, kernel);
      break;
    case "plane-cut":
      document = await cutWithPlane(source, request.operation, kernel);
      break;
    case "mirror":
      document = await mirrorDocument(source, request.operation, kernel);
      break;
    case "project":
      document = await projectDocument(source, request.projection, kernel);
      break;
    default: {
      const { sketch: target, intent = { kind: "direct" } } = request;
      const result = await solveSketch(
        target,
        source.sketches.find((s) => s.id === target.id),
        solver,
        request.kind === "edit",
        intent,
      );
      return { document: withSketch(source, result.sketch), count: result.count, ms: result.ms };
    }
  }
  return { document, count: 0, ms: 0 };
}
