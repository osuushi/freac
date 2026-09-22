import type { ScriptOperation } from "../agent-script/api.js";
import type { SketchDocument } from "../sketch/document.js";

type SolidOperation = Extract<
  ScriptOperation,
  { kind: "extrude" | "revolve" | "sweep" | "offsetFaces" | "transformBodies" }
>;
export function validateScriptSolid(document: SketchDocument, operation: SolidOperation): void {
  const ids = (values: unknown): values is string[] =>
    Array.isArray(values) &&
    values.length <= 1000 &&
    new Set(values).size === values.length &&
    values.every((id) => document.bodies?.some((b) => b.id === id));
  if (operation.kind === "extrude" || operation.kind === "revolve" || operation.kind === "sweep") {
    validateSweep(operation, ids);
  } else if (operation.kind === "offsetFaces") {
    const o = operation.input;
    if (
      !Number.isFinite(o.distance) ||
      !Array.isArray(o.faces) ||
      !o.faces.length ||
      o.faces.length > 1000 ||
      (o.radius !== undefined && (!Number.isFinite(o.radius) || o.radius <= 0))
    )
      throw new Error("Invalid script face offset");
    for (const t of o.faces)
      if (!t || !document.bodies?.find((b) => b.id === t.body)?.faces.some((f) => f.id === t.face))
        throw new Error("Unknown face target");
  } else if (operation.kind === "transformBodies") {
    const t = operation.input;
    if (
      !ids(t.ids) ||
      !t.ids.length ||
      ![t.translation, t.pivot, t.axis].every(
        (v) => Array.isArray(v) && v.length === 3 && v.every(Number.isFinite),
      ) ||
      !Number.isFinite(t.angle) ||
      Math.hypot(...t.axis) < 1e-8 ||
      typeof t.duplicate !== "boolean"
    )
      throw new Error("Invalid script body transform");
  } else throw new Error("Unknown script operation");
}

function validateSweep(
  operation: Extract<SolidOperation, { kind: "extrude" | "revolve" | "sweep" }>,
  ids: (values: unknown) => boolean,
): void {
  const e = operation.input;
  if (
    !["auto", "new", "union", "subtract", "intersect"].includes(e.mode) ||
    !Array.isArray(e.sources) ||
    !e.sources.length ||
    e.sources.length > 1000 ||
    !e.sources.every(
      (s) =>
        s &&
        ("face" in s
          ? typeof s.face === "string"
          : typeof s.sketch === "string" && typeof s.profile === "string"),
    ) ||
    (e.targets !== undefined && !ids(e.targets)) ||
    (e.eligibleTargets !== undefined && !ids(e.eligibleTargets))
  )
    throw new Error("Invalid script sweep sources or Boolean targets");
  if (operation.kind === "extrude") {
    const e = operation.input;
    if (
      !Number.isFinite(e.distance) ||
      (e.symmetric !== undefined && typeof e.symmetric !== "boolean") ||
      (e.twist !== undefined &&
        (!e.twist ||
          !Number.isFinite(e.twist.angle) ||
          !Array.isArray(e.twist.origin) ||
          e.twist.origin.length !== 3 ||
          !e.twist.origin.every(Number.isFinite))) ||
      (e.draft !== undefined &&
        (!e.draft ||
          !["angle", "offset"].includes(e.draft.mode) ||
          !Number.isFinite(e.draft.value)))
    )
      throw new Error("Invalid script extrusion");
  } else if (operation.kind === "sweep") {
    const { path } = operation.input;
    if (
      !Array.isArray(path) ||
      !path.length ||
      path.length > 256 ||
      path.some(
        (s) =>
          !s ||
          !["line", "bezier"].includes(s.kind) ||
          (s.kind === "line" ? [s.a, s.b] : [s.a, s.c1, s.c2, s.b]).some(
            (v) => !Array.isArray(v) || v.length !== 3 || !v.every(Number.isFinite),
          ),
      )
    )
      throw new Error("Sweep requires 1–256 finite line or cubic Bézier path segments");
  } else {
    const r = operation.input;
    if (
      !Number.isFinite(r.angle) ||
      !Number.isFinite(r.height) ||
      !r.axis ||
      ![r.axis.origin, r.axis.direction].every(
        (v) => Array.isArray(v) && v.length === 3 && v.every(Number.isFinite),
      ) ||
      Math.hypot(...r.axis.direction) < 1e-8
    )
      throw new Error("Invalid script revolution");
  }
}
