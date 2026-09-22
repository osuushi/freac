import type { SketchDocument } from "../sketch/document.js";
import type { ModelingTarget } from "../sketch/model-selection.js";
import type { Body, BodyEdgeFinish, BodyFaceOffset, BodyShell, Face, LiftSource } from "./body.js";
import { type CleanupSelection, cleanupSelection } from "./cleanup.js";
import { expandedSelection, type SelectionContext, selectionContext } from "./selection-context.js";

export interface MovementSelection {
  bodies: Body[];
  faces: BodyFaceOffset["faces"];
  edges: BodyEdgeFinish["edges"];
}
export interface DeletionSelection {
  bodyIds: string[];
  sketchIds: string[];
  topology: CleanupSelection[];
}
export interface OperationInputs {
  scale: MovementSelection;
  move: MovementSelection;
  duplicate: Body[];
  mirror: Body[];
  boolean: Body[];
  shell: BodyShell["selection"];
  offset: { targets: BodyFaceOffset["faces"]; faces: Face[] };
  fillet: BodyEdgeFinish["edges"];
  chamfer: BodyEdgeFinish["edges"];
  extrude: LiftSource[];
  revolve: LiftSource[];
  cleanup: CleanupSelection[];
  delete: DeletionSelection;
}
export type Operation = keyof OperationInputs;
export type Resolution<T> = { available: true; inputs: T } | { available: false; reason: string };
const unavailable = (reason: string): Resolution<never> => ({ available: false, reason });
const available = <T>(inputs: T): Resolution<T> => ({ available: true, inputs });

/** Concrete operation inputs and eligibility are resolved together, without changing selection. */
export function resolveOperation<K extends Operation>(
  operation: K,
  targets: readonly ModelingTarget[],
  document: SketchDocument,
): Resolution<OperationInputs[K]> {
  const context = selectionContext(targets, document);
  if (!context.ordered.length) return unavailable("Select geometry first");
  if (!context.valid) return unavailable("The selection contains geometry that no longer exists");
  return resolvers[operation](context, document);
}

type Resolver<K extends Operation> = (
  c: SelectionContext,
  document: SketchDocument,
) => Resolution<OperationInputs[K]>;

/** Each entry must return the inputs declared by its operation, checked without casts. */
const resolvers: { [K in Operation]: Resolver<K> } = {
  scale: movementSelection,
  move: movementSelection,
  duplicate: wholeBodySelection,
  mirror: wholeBodySelection,
  boolean: (c) => {
    const result = wholeBodySelection(c);
    return result.available && result.inputs.length < 2
      ? unavailable("Select at least two complete bodies")
      : result;
  },
  shell: shellSelection,
  offset: offsetSelection,
  fillet: edgeSelection,
  chamfer: edgeSelection,
  extrude: liftSelection,
  revolve: liftSelection,
  cleanup: (c) =>
    solidOnly(c)
      ? available(cleanupSelection(coverageTargets(c)))
      : unavailable("Cleanup requires solid geometry"),
  delete: deletionSelection,
};

const solidOnly = (c: SelectionContext) => c.ordered.every((t) => "body" in t);
function uncoveredEdges(c: SelectionContext) {
  const whole = new Set(c.complete.map((b) => b.id));
  return c.edges.filter((t) => !whole.has(t.body));
}
function movementSelection(c: SelectionContext): Resolution<MovementSelection> {
  if (!solidOnly(c)) return unavailable("Move requires bodies, faces or edges");
  const remainingEdges = uncoveredEdges(c);
  if (c.partialFaces.length && remainingEdges.length)
    return unavailable("Moving partial faces and edges together is not supported");
  return available({
    bodies: c.complete,
    faces: c.partialFaces.map(({ body, face }) => ({ body, face })),
    edges: remainingEdges.map(({ body, edge }) => ({ body, edge })),
  });
}
function wholeBodySelection(c: SelectionContext): Resolution<Body[]> {
  if (!solidOnly(c) || c.partialFaces.length || uncoveredEdges(c).length || !c.complete.length)
    return unavailable("Select complete bodies");
  return available(c.complete);
}
function edgeSelection(c: SelectionContext): Resolution<BodyEdgeFinish["edges"]> {
  return c.ordered.every((t) => t.kind === "edge")
    ? available(c.edges.map(({ body, edge }) => ({ body, edge })))
    : unavailable("Select explicit edges");
}
function offsetSelection(
  c: SelectionContext,
  document: SketchDocument,
): Resolution<OperationInputs["offset"]> {
  if (!solidOnly(c) || c.edges.length)
    return unavailable("Offset requires faces or complete bodies");
  const faces = c.faces.flatMap(
    (t) =>
      document.bodies?.find((b) => b.id === t.body)?.faces.filter((f) => f.id === t.face) ?? [],
  );
  if (faces.length !== c.faces.length) return unavailable("A selected face no longer exists");
  if (faces.some((f) => !f.plane && !f.cylinder && !f.offsetHandle))
    return unavailable("A selected face has no supported offset direction");
  return available({ targets: c.faces.map(({ body, face }) => ({ body, face })), faces });
}
function deletionSelection(c: SelectionContext): Resolution<DeletionSelection> {
  if (c.ordered.some((t) => t.kind === "profile"))
    return unavailable("Select whole sketches to delete them");
  return available({
    bodyIds: c.complete.map((b) => b.id),
    sketchIds: c.ordered.flatMap((t) => (t.kind === "sketch" ? [t.sketch] : [])),
    topology: cleanupSelection([...c.partialFaces, ...uncoveredEdges(c)]),
  });
}

/** Collapse complete coverage for operations whose whole-body meaning is authoritative. */
export function coverageTargets(c: SelectionContext): ModelingTarget[] {
  const whole = new Set(c.complete.map((b) => b.id));
  const seen = new Set<string>();
  return c.ordered.flatMap((t): ModelingTarget[] => {
    if (!("body" in t) || !whole.has(t.body)) return [t];
    if (seen.has(t.body)) return [];
    seen.add(t.body);
    return [{ kind: "body", body: t.body }];
  });
}

function liftSelection(c: SelectionContext, document: SketchDocument): Resolution<LiftSource[]> {
  let normal: number[] | null = null;
  const sources: LiftSource[] = [];
  for (const t of expandedSelection(c)) {
    const plane =
      t.kind === "face"
        ? document.bodies?.find((b) => b.id === t.body)?.faces.find((f) => f.id === t.face)?.plane
        : t.kind === "profile"
          ? document.sketches.find((s) => s.id === t.sketch)?.plane
          : null;
    if (!plane)
      return unavailable("Select planar faces or filled sketch regions with a common direction");
    const { u, v } = plane;
    const n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
    if (normal && normal.reduce((sum, x, i) => sum + x * n[i], 0) < 1 - 1e-7)
      return unavailable("Selected surfaces must have a common direction");
    normal = n;
    if (t.kind === "face") sources.push({ face: t.face });
    if (t.kind === "profile") sources.push({ sketch: t.sketch, profile: t.profile.key });
  }
  return available(sources);
}

function shellSelection(c: SelectionContext): Resolution<BodyShell["selection"]> {
  if (!solidOnly(c) || c.edges.length) return unavailable("Shell requires bodies or opening faces");
  const ids = [...new Set(c.faces.map((f) => f.body))];
  return available(
    ids.map((body) => ({
      body,
      faces: c.partialFaces.filter((f) => f.body === body).map((f) => f.face),
    })),
  );
}
