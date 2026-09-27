import type { ScriptOperation, ScriptResult } from "../agent-script/api.js";
import { continueDecorators } from "../decorators/continuation.js";
import type { SketchDocument } from "../sketch/document.js";
import { continuingBodies, materialize } from "./kernel-result.js";
import type { SolidCalculator } from "./solid-calculator.js";

export async function scriptTopology(
  document: SketchDocument,
  operation: Extract<ScriptOperation, { kind: "topology" | "replaceFace" }>,
  kernel: SolidCalculator,
): Promise<{ document: SketchDocument; result: ScriptResult }> {
  const bodies = document.bodies ?? [];
  const body = bodies.find((b) => b.id === operation.input.body);
  if (!body) throw new Error("Unknown topology body");
  if (operation.kind === "topology") {
    const result = await kernel.calculate({ kind: "topology", body: body.id, bodies: [body] });
    if (!result.topology) throw new Error("Missing topology result");
    return { document, result: result.topology };
  }
  const { face, surface } = operation.input;
  if (!body.faces.some((f) => f.id === face)) throw new Error("Unknown replacement face");
  if (
    !surface ||
    !["cylinder", "cone"].includes(surface.kind) ||
    ![surface.origin, surface.axis].every(
      (v) => Array.isArray(v) && v.length === 3 && v.every(Number.isFinite),
    ) ||
    Math.abs(Math.hypot(...surface.axis) - 1) > 1e-7 ||
    !Number.isFinite(surface.radius) ||
    surface.radius <= 1e-7 ||
    (surface.kind === "cone" &&
      (!Number.isFinite(surface.semiAngle) || Math.abs(surface.semiAngle) >= 89))
  )
    throw new Error(
      "Invalid replacement support: unit axis, positive radius and finite semi-angle required",
    );
  const result = await kernel.calculate({
    kind: "replace-face",
    ...operation.input,
    bodies: [body],
  });
  const next = result.participants.length
    ? continueDecorators(document, {
        ...document,
        bodies: continuingBodies(bodies, materialize(bodies, result)),
      })
    : document;
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
