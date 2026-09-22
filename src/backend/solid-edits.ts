import type { BodyEdgeFinish, BooleanMode, EdgeMovement, FaceMovement } from "../model/body.js";
import { type CleanupSelection, operationCleanup } from "../model/cleanup.js";
import type { SketchDocument } from "../sketch/document.js";
import type { ModelRequest } from "../sketch/model-api.js";
import { EdgeSizeLimit } from "./edge-size-limit.js";
import { FaceOffsetEdit } from "./face-offset-edit.js";
import { kernelInput, revolveInput } from "./kernel-input.js";
import { continuingBodies, materialize } from "./kernel-result.js";
import type { SolidCalculator } from "./solid-calculator.js";

/** Geometry calculations and their temporary measurements; no accepted document or history. */
export class SolidEdits {
  readonly offsetEdit = new FaceOffsetEdit();
  private edgeLimit = new EdgeSizeLimit();
  edgeSize: number | undefined;
  edgeSelection: BodyEdgeFinish["edges"] = [];
  booleanTargets: string[] = [];
  booleanMode: BooleanMode | undefined;
  constructor(private kernel: SolidCalculator) {}
  async selectFinishEdges(
    document: SketchDocument,
    operation: Omit<BodyEdgeFinish, "size">,
  ): Promise<void> {
    this.edgeSelection = [];
    const result = await this.kernel.calculate({
      ...operation,
      kind: "edge-finish-selection",
      bodies: document.bodies ?? [],
    });
    if (!result.edgeSelection?.length) throw new Error("No eligible edges in selection");
    this.edgeSelection = result.edgeSelection;
  }
  async checkCleanup(original: SketchDocument, candidate: SketchDocument): Promise<boolean> {
    const bodies = candidate.bodies ?? [];
    const result = await this.kernel.calculate({
      kind: "cleanup",
      bodies,
      selection: operationCleanup(original.bodies ?? [], bodies),
    });
    return result.participants.length > 0;
  }
  async removeTopology(
    document: SketchDocument,
    selection: CleanupSelection[],
    kind: "cleanup" | "delete-topology" = "cleanup",
  ): Promise<SketchDocument> {
    const bodies = document.bodies ?? [];
    const result = await this.kernel.calculate({ kind, selection, bodies });
    return result.participants.length
      ? { ...document, bodies: continuingBodies(bodies, materialize(bodies, result)) }
      : document;
  }
  private async move(
    document: SketchDocument,
    request:
      | { kind: "move-faces"; operation: FaceMovement }
      | { kind: "move-edges"; operation: EdgeMovement },
  ): Promise<SketchDocument> {
    const bodies = document.bodies ?? [];
    const ids = request.operation.bodyIds ?? [];
    const componentBodies =
      request.kind === "move-faces"
        ? request.operation.faces.map((t) => t.body)
        : request.operation.edges.map((t) => t.body);
    if (ids.some((id) => componentBodies.includes(id)))
      throw new Error("Whole-body and component movement must target disjoint bodies");
    const result = await this.kernel.calculate(
      request.kind === "move-edges"
        ? { ...request.operation, kind: "move-edges", bodies }
        : { ...request.operation, kind: "move-faces", bodies },
    );
    let next = continuingBodies(bodies, materialize(bodies, result));
    if (ids.length) {
      const transform = await this.kernel.calculate({
        kind: "transform",
        bodies,
        ids,
        duplicate: false,
        translation: request.operation.translation,
        pivot: request.kind === "move-faces" ? request.operation.pivot : [0, 0, 0],
        axis: request.kind === "move-faces" ? request.operation.axis : [0, 0, 1],
        angle: request.kind === "move-faces" ? request.operation.angle : 0,
      });
      const transformed = materialize(bodies, transform);
      const continued = continuingBodies(bodies, transformed);
      next = next.map((body, index) => (ids.includes(body.id) ? continued[index] : body));
    }
    return { ...document, bodies: next };
  }
  async calculate(
    document: SketchDocument,
    request: Extract<
      ModelRequest,
      {
        kind:
          | "revolve"
          | "extrude"
          | "transform-bodies"
          | "boolean-bodies"
          | "finish-edges"
          | "offset-faces"
          | "shell"
          | "move-faces"
          | "move-edges";
      }
    >,
  ): Promise<SketchDocument> {
    let candidate: SketchDocument;
    const bodies = document.bodies ?? [];
    if (request.kind === "move-faces" || request.kind === "move-edges") {
      candidate = await this.move(document, request);
    } else if (request.kind === "shell") {
      if (!Number.isFinite(request.operation.thickness))
        throw new Error("Enter a finite shell thickness");
      const result = await this.kernel.calculate({ ...request.operation, kind: "shell", bodies });
      candidate = { ...document, bodies: continuingBodies(bodies, materialize(bodies, result)) };
    } else if (request.kind === "offset-faces") {
      candidate = await this.offsetEdit.calculate(document, request.operation, (distance) =>
        this.kernel.probe({ ...request.operation, distance, kind: "offset-faces", bodies }),
      );
    } else if (request.kind === "finish-edges") {
      const result = await this.edgeLimit.calculate(document, request.operation, (size) =>
        this.kernel.probe({ ...request.operation, size, kind: "edge-finish", bodies }),
      );
      this.edgeSize = result.size;
      candidate = result.result
        ? {
            ...document,
            bodies: continuingBodies(bodies, materialize(bodies, result.result)),
          }
        : document;
    } else if (request.kind === "transform-bodies") {
      const result = await this.kernel.calculate({
        ...request.transform,
        kind: "transform",
        bodies,
      });
      const transformed = materialize(bodies, result);
      candidate = {
        ...document,
        bodies: request.transform.duplicate ? transformed : continuingBodies(bodies, transformed),
      };
    } else {
      const result = await this.kernel.calculate(
        request.kind === "boolean-bodies"
          ? { ...request.operation, kind: "boolean", bodies }
          : request.kind === "revolve"
            ? revolveInput(document, request.revolution, bodies)
            : kernelInput(document, request.extrusion, bodies),
      );
      this.booleanMode = result.mode;
      this.booleanTargets = result.participants;
      const next = materialize(bodies, result);
      candidate = {
        ...document,
        bodies: next,
      };
    }
    return candidate;
  }
}
