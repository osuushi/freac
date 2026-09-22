import { operationCleanup } from "../model/cleanup.js";
import { cancellableCalculation } from "../sketch/calculation-state.js";
import type { SketchDocument } from "../sketch/document.js";
import type { ModelReply, ModelRequest, ModelView } from "../sketch/model-api.js";
import { describeOperation, type HistoryOperation } from "../sketch/operation-history.js";
import { editDocument, isDirectDocumentEdit } from "./document-edits.js";
import { type PreviewRequest, previewDocument } from "./document-preview.js";
import { DocumentStore } from "./document-store.js";
import { materialize } from "./kernel-result.js";
import { measurementInput } from "./measurement-input.js";
import { NativeSolver } from "./native-solver.js";
import { validateDocument } from "./open-document.js";
import { planeCutAvailable } from "./plane-cut.js";
import { ScriptEdits } from "./script-edits.js";
import { SolidCalculator } from "./solid-calculator.js";
import { SolidEdits } from "./solid-edits.js";

export class DocumentOwner {
  private kernel: SolidCalculator;
  private measurementKernel: SolidCalculator;
  private solids: SolidEdits;
  private cleanupAvailable = false;
  private planeCutAvailable = false;
  private store = new DocumentStore();
  private pendingOperation: HistoryOperation | null = null;
  private candidate: SketchDocument | null = null;
  private active: { kind: ModelRequest["kind"]; promise: Promise<ModelReply> } | null = null;
  private cancelling = false;
  private solveCount = 0;
  private solveMs = 0;
  readonly scripts: ScriptEdits;
  constructor(
    private solver = new NativeSolver(),
    kernelExecutable?: string,
  ) {
    this.kernel = new SolidCalculator(kernelExecutable);
    this.measurementKernel = new SolidCalculator(kernelExecutable);
    this.solids = new SolidEdits(this.kernel);
    this.scripts = new ScriptEdits(() => this.store, this.solids, this.kernel, solver);
  }
  beginScript(name: string): void {
    if (this.active || this.cancelling || this.candidate)
      throw new Error("Finish the current edit first");
    this.scripts.begin(name);
  }
  get view(): ModelView {
    return {
      data: this.store.data,
      planeCutAvailable: this.planeCutAvailable,
      ...this.solids.offsetEdit.view,
      edgeSize: this.solids.edgeSize,
      cleanupAvailable: this.cleanupAvailable,
      edgeSelection: this.solids.edgeSelection,
      booleanMode: this.solids.booleanMode,
      booleanTargets: this.solids.booleanTargets,
      canUndo: this.store.canUndo,
      canRedo: this.store.canRedo,
      candidate: this.candidate,
      solveCount: this.solveCount,
      solveMs: this.solveMs,
    };
  }
  private async preview(request: PreviewRequest): Promise<void> {
    const result = await previewDocument(this.store.data, request, this.kernel, this.solver);
    this.solveCount += result.count;
    if (result.count) this.solveMs = result.ms;
    this.candidate = result.document;
    if (request.kind === "edit") await this.accept();
  }
  private async open(source: SketchDocument): Promise<void> {
    validateDocument(source);
    const result = await this.kernel.calculate({
      kind: "inspect",
      bodies: source.bodies ?? [],
    });
    const document = { ...source, bodies: materialize([], result) };
    validateDocument(document);
    this.store = new DocumentStore(document);
    this.pendingOperation = null;
    this.candidate = null;
  }
  async call(request: ModelRequest): Promise<ModelReply> {
    if (this.scripts.busy && request.kind !== "read" && request.kind !== "read-history")
      return { view: this.view, error: "Finish or cancel the running script first" };
    if (request.kind === "measure") {
      try {
        const result = await this.measurementKernel.calculate(
          measurementInput(this.store.data, request.targets),
        );
        return { view: this.view, measurement: result.measurement };
      } catch (error) {
        return { view: this.view, error: error instanceof Error ? error.message : String(error) };
      }
    }
    if (request.kind === "read-history") return { view: this.view, history: this.store.history };
    if (request.kind === "supersede-preview") {
      if (
        request.interrupt &&
        this.active &&
        ["extrude", "check-cleanup"].includes(this.active.kind)
      ) {
        this.kernel.supersede();
        await this.kernel.cancel();
        await this.active?.promise;
      }
      if (this.active && ["finish-edges", "offset-faces"].includes(this.active.kind))
        this.kernel.supersede();
      return { view: this.view };
    }
    if (request.kind === "cancel-preview") return this.cancelPreview();
    if (this.active || this.cancelling) {
      const error = "Finish the current edit first";
      this.store.record(describeOperation(request), "failed", error);
      return { view: this.view, error };
    }
    this.kernel.begin();
    const promise = this.execute(request);
    this.active = { kind: request.kind, promise };
    try {
      return await promise;
    } finally {
      this.active = null;
    }
  }
  private async cancelPreview(): Promise<ModelReply> {
    if (this.cancelling || (this.active && !cancellableCalculation(this.active.kind)))
      return { view: this.view, error: "Finish the current edit first" };
    this.cancelling = true;
    try {
      await Promise.all([this.kernel.cancel(), this.solver.cancel(), this.active?.promise]);
      if (this.pendingOperation) this.store.record(this.pendingOperation, "cancelled");
      this.candidate = null;
      this.pendingOperation = null;
      return { view: this.view };
    } finally {
      this.cancelling = false;
    }
  }
  private async accept(cleanup = false): Promise<void> {
    if (!this.candidate) throw new Error("No valid edit to accept");
    if (cleanup)
      this.candidate = await this.solids.removeTopology(
        this.candidate,
        operationCleanup(this.store.data.bodies ?? [], this.candidate.bodies ?? []),
      );
    this.store.accept(this.candidate, {
      ...(this.pendingOperation ?? describeOperation({ kind: "accept" })),
      ...(cleanup ? { parameters: { ...this.pendingOperation?.parameters, cleanup: true } } : {}),
    });
    this.candidate = null;
    this.pendingOperation = null;
  }
  private async execute(request: ModelRequest): Promise<ModelReply> {
    let operation =
      request.kind === "accept"
        ? (this.pendingOperation ?? describeOperation(request))
        : describeOperation(request);
    if (request.kind === "accept" && request.cleanup)
      operation = { ...operation, parameters: { ...operation.parameters, cleanup: true } };
    try {
      if (request.kind === "check-plane-cut")
        this.planeCutAvailable = await planeCutAvailable(
          this.store.data,
          request.operation,
          this.kernel,
        );
      else await this.dispatch(request, operation);
      return { view: this.view };
    } catch (error) {
      const message = this.kernel.wasSuperseded
        ? "Preview superseded"
        : error instanceof Error
          ? error.message
          : String(error);
      const outcome = this.cancelling || message === "Preview superseded" ? "cancelled" : "failed";
      this.store.record(operation, outcome, message);
      if (request.kind !== "accept" && request.kind !== "check-cleanup") {
        this.candidate = null;
        this.pendingOperation = null;
      }
      return { view: this.view, error: message };
    }
  }
  private async dispatch(request: ModelRequest, operation: HistoryOperation): Promise<void> {
    this.cleanupAvailable = false;
    if (isDirectDocumentEdit(request)) {
      this.pendingOperation = null;
      this.candidate = null;
      this.store.accept(editDocument(this.store.data, request), operation);
      return;
    }
    switch (request.kind) {
      case "check-cleanup":
        if (this.candidate)
          this.cleanupAvailable = await this.solids.checkCleanup(this.store.data, this.candidate);
        break;
      case "cleanup":
      case "delete-topology":
        this.pendingOperation = operation;
        this.candidate = await this.solids.removeTopology(
          this.store.data,
          request.selection,
          request.kind,
        );
        if (request.kind === "delete-topology") await this.accept();
        break;
      case "open":
        await this.open(request.document);
        break;
      case "edge-finish-selection":
        await this.solids.selectFinishEdges(this.store.data, request.operation);
        break;
      case "move-edges":
      case "move-faces":
      case "shell":
      case "offset-faces":
      case "finish-edges":
      case "boolean-bodies":
      case "transform-bodies":
      case "revolve":
      case "extrude":
        this.pendingOperation = operation;
        this.candidate = null;
        this.candidate = await this.solids.calculate(this.store.data, request);
        if (request.kind === "transform-bodies") await this.accept();
        break;
      case "mirror":
      case "scale":
      case "plane-cut":
      case "project":
      case "preview":
      case "edit":
        this.pendingOperation = operation;
        this.candidate = null;
        await this.preview(request);
        break;
      case "accept":
        await this.accept(request.cleanup);
        break;
      case "discard":
        if (this.pendingOperation) this.store.record(this.pendingOperation, "cancelled");
        this.pendingOperation = null;
        this.candidate = null;
        break;
      case "undo":
      case "redo":
        this.pendingOperation = null;
        this.candidate = null;
        this.store[request.kind]();
        break;
      case "new":
        this.candidate = null;
        this.store = new DocumentStore();
        this.pendingOperation = null;
        break;
      case "delete-entities":
        await this.deleteEntities(request, operation);
        break;
      case "read":
        break;
      default:
        throw new Error("Unknown sketch operation");
    }
  }
  private async deleteEntities(
    request: Extract<ModelRequest, { kind: "delete-entities" }>,
    operation: HistoryOperation,
  ): Promise<void> {
    this.pendingOperation = null;
    this.candidate = null;
    const reduced = editDocument(this.store.data, request);
    const candidate = request.topology?.length
      ? await this.solids.removeTopology(reduced, request.topology, "delete-topology")
      : reduced;
    this.store.accept(candidate, operation);
  }
  close(): void {
    this.measurementKernel.close();
    this.solver.close();
    this.kernel.close();
  }
}
