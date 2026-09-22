import { cancellableCalculation } from "./calculation-state.js";
import type { ModelCall, ModelRequest, ModelView } from "./model-api.js";
import type { HistoryOperation, OperationHistoryEntry } from "./operation-history.js";

declare global {
  interface Window {
    freacModel?: ModelCall;
  }
}
const call: ModelCall = async (request) => {
  if (window.freacModel) return window.freacModel(request);
  const response = await fetch("/sketch-api", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(request),
  });
  if (!response.ok) throw new Error("Sketch backend is unavailable");
  return response.json();
};

// A read-only rendering copy. Accepted edits and all Undo snapshots live in the host.
export class ModelClient {
  private view: ModelView = {
    data: { units: "mm", sketches: [] },
    canUndo: false,
    canRedo: false,
    candidate: null,
    solveCount: 0,
    solveMs: 0,
  };
  lastEdit: ModelRequest | null = null;
  scriptRunning = false;
  scriptState(running: boolean, view?: ModelView): void {
    this.scriptRunning = running;
    if (view) this.view = view;
    this.changed();
  }
  busy = true;
  working = false;
  slow = false;
  calculation: ModelRequest["kind"] | undefined;
  started = 0;
  get canCancel(): boolean {
    return (
      this.working &&
      !this.cancelling &&
      !!this.calculation &&
      cancellableCalculation(this.calculation)
    );
  }
  private cancelling = false;
  private superseding: Promise<unknown> | null = null;
  private interrupted = false;
  private waiting: Promise<boolean> = Promise.resolve(true);
  constructor(
    private changed: () => void,
    private error: (message: string) => void,
    private navigated?: (operation: HistoryOperation, direction: "undo" | "redo") => void,
  ) {}
  get planeCutAvailable() {
    return this.view.planeCutAvailable ?? false;
  }
  get cleanupAvailable() {
    return this.view.cleanupAvailable ?? false;
  }
  get edgeSelection() {
    return this.view.edgeSelection ?? [];
  }
  get offsetDistance() {
    return this.view.offsetDistance;
  }
  get offsetSelection() {
    return this.view.offsetSelection;
  }
  get edgeSize() {
    return this.view.edgeSize;
  }
  get data() {
    return this.view.data;
  }
  get canUndo() {
    return this.view.canUndo;
  }
  get canRedo() {
    return this.view.canRedo;
  }
  get booleanTargets() {
    return this.view.booleanTargets ?? [];
  }
  get booleanMode() {
    return this.view.booleanMode;
  }
  get candidate() {
    return this.view.candidate;
  }
  get statistics() {
    return { count: this.view.solveCount, milliseconds: this.view.solveMs };
  }
  async history(): Promise<OperationHistoryEntry[]> {
    const reply = await call({ kind: "read-history" });
    if (reply.error) throw new Error(reply.error);
    return reply.history ?? [];
  }
  async measure(targets: import("../model/measurement.js").MeasurementTarget[]) {
    const reply = await call({ kind: "measure", targets });
    if (reply.error) throw new Error(reply.error);
    if (!reply.measurement) throw new Error("Measurement unavailable");
    return reply.measurement;
  }
  async request(request: ModelRequest): Promise<boolean> {
    if (this.working || this.cancelling || this.scriptRunning) return false;
    if (
      !["read", "accept", "discard", "undo", "redo", "check-cleanup", "check-plane-cut"].includes(
        request.kind,
      )
    )
      this.lastEdit = request;
    this.working = true;
    this.calculation = request.kind;
    this.started = performance.now();
    this.busy = true;
    this.changed();
    this.waiting = this.send(request);
    return this.waiting;
  }
  private async send(request: ModelRequest): Promise<boolean> {
    const timer = setTimeout(() => {
      this.slow = true;
      this.changed();
    }, 150);
    try {
      // Keep the history lookup and navigation inside the same busy interval.
      const direction = request.kind === "undo" || request.kind === "redo" ? request.kind : null;
      const history = direction ? await this.history() : [];
      const entry =
        direction === "undo"
          ? history.reverse().find((entry) => entry.state === "applied")
          : history.find((entry) => entry.state === "undone");
      const reply = await call(request);
      if (this.interrupted) return false;
      this.view = reply.view;
      if (reply.error) throw new Error(reply.error);
      if (direction && entry) this.navigated?.(entry.operation, direction);
      this.error("");
      return true;
    } catch (error) {
      if (
        !this.cancelling &&
        !(this.superseding && error instanceof Error && error.message === "Preview superseded")
      )
        this.error(error instanceof Error ? error.message : String(error));
      return false;
    } finally {
      // Drain the control message before another calculation can occupy the slot.
      await this.superseding;
      this.superseding = null;
      this.interrupted = false;
      clearTimeout(timer);
      this.slow = false;
      this.working = false;
      this.calculation = undefined;
      this.busy = this.cancelling;
      this.changed();
    }
  }
  supersedePreview(interrupt = false): void {
    if (!this.working || this.superseding || this.cancelling) return;
    this.interrupted = interrupt;
    this.superseding = call({ kind: "supersede-preview", interrupt }).catch(() => undefined);
  }
  async cancelPreview(): Promise<void> {
    if (this.cancelling) return;
    this.cancelling = true;
    try {
      const reply = await call({ kind: "cancel-preview" });
      await this.waiting;
      this.view = reply.view;
      this.error(reply.error ?? "");
    } catch (error) {
      this.error(error instanceof Error ? error.message : String(error));
    } finally {
      this.cancelling = false;
      this.busy = false;
      this.changed();
    }
  }
  async settled(): Promise<void> {
    await this.waiting;
  }
}
