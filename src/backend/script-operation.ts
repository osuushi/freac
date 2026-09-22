import type { ScriptOperation, ScriptResult } from "../agent-script/api.js";
import { emptySketch, newId, type SketchDocument, withSketch } from "../sketch/document.js";
import { planes, validateFrame } from "../sketch/planes.js";
import { profilesFor } from "../sketch/profiles.js";
import { pathSweepInput } from "./kernel-input.js";
import { materialize } from "./kernel-result.js";
import type { NativeSolver } from "./native-solver.js";
import { scriptModelingOperation } from "./script-modeling-operation.js";
import { scriptSolidTool } from "./script-solid-tools.js";
import { validateScriptSolid } from "./script-validation.js";
import type { SolidCalculator } from "./solid-calculator.js";
import type { SolidEdits } from "./solid-edits.js";
import { solveSketch } from "./solve-sketch.js";

/** Validate the public operation before it reaches the shared solver/kernel. */
export async function scriptOperation(
  document: SketchDocument,
  operation: ScriptOperation,
  solids: SolidEdits,
  solver: NativeSolver,
  kernel: SolidCalculator,
): Promise<{ document: SketchDocument; result: ScriptResult }> {
  if (!operation || typeof operation !== "object" || !operation.input)
    throw new Error("Invalid script operation");
  if (operation.kind === "createSketch") return createScriptSketch(document, operation, solver);
  if (
    operation.kind === "constructionPlane" ||
    operation.kind === "deleteConstructionPlane" ||
    operation.kind === "splitBody" ||
    operation.kind === "imprint" ||
    operation.kind === "scale"
  )
    return scriptModelingOperation(document, operation, kernel);
  let next: SketchDocument;
  if (
    operation.kind === "booleanBodies" ||
    operation.kind === "finishEdges" ||
    operation.kind === "shell"
  ) {
    next = await scriptSolidTool(document, operation, solids);
  } else {
    validateScriptSolid(document, operation);
    next = await calculateScriptSolid(document, operation, solids, kernel);
  }
  return {
    document: next,
    result: {
      bodies: (next.bodies ?? []).map((b) => ({
        id: b.id,
        volume: b.volume,
        faces: b.faces.map((f) => f.id),
        edges: b.edges.map((e) => e.id),
      })),
    },
  };
}

async function calculateScriptSolid(
  document: SketchDocument,
  operation: Extract<
    ScriptOperation,
    { kind: "sweep" | "extrude" | "revolve" | "offsetFaces" | "transformBodies" }
  >,
  solids: SolidEdits,
  kernel: SolidCalculator,
): Promise<SketchDocument> {
  let next: SketchDocument;
  if (operation.kind === "sweep") {
    const bodies = document.bodies ?? [];
    const result = await kernel.calculate(pathSweepInput(document, operation.input, bodies));
    next = { ...document, bodies: materialize(bodies, result) };
  } else if (operation.kind === "extrude") {
    const e = operation.input;
    next = await solids.calculate(document, { kind: "extrude", extrusion: e });
  } else if (operation.kind === "revolve") {
    next = await solids.calculate(document, { kind: "revolve", revolution: operation.input });
  } else if (operation.kind === "offsetFaces") {
    const o = operation.input;
    next = await solids.calculate(document, { kind: "offset-faces", operation: o });
    if (solids.offsetEdit.view.offsetDistance !== o.distance)
      throw new Error("Requested offset could not be achieved exactly");
  } else if (operation.kind === "transformBodies") {
    const t = operation.input;
    next = await solids.calculate(document, { kind: "transform-bodies", transform: t });
  } else throw new Error("Unknown script operation");
  return next;
}

async function createScriptSketch(
  document: SketchDocument,
  operation: Extract<ScriptOperation, { kind: "createSketch" }>,
  solver: NativeSolver,
): Promise<{ document: SketchDocument; result: ScriptResult }> {
  const { plane, curves } = operation.input;
  const frame = typeof plane === "string" ? planes[plane] : plane;
  if (!frame || !Array.isArray(curves) || !curves.length || curves.length > 1000)
    throw new Error("A script sketch requires a plane and 1–1000 curves");
  validateFrame(frame);
  const sketch = {
    ...emptySketch(frame),
    curves: curves.map((curve) => ({ ...curve, id: newId(), construction: false })),
  };
  const solved = await solveSketch(sketch, undefined, solver, true, { kind: "direct" });
  return {
    document: withSketch(document, solved.sketch),
    result: {
      sketch: sketch.id,
      curves: sketch.curves.map((c) => c.id),
      profiles: profilesFor(solved.sketch).map((p) => ({ sketch: sketch.id, profile: p.key })),
    },
  };
}
