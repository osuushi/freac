import { type SketchDocument, validateSketch } from "../sketch/document.js";
import {
  emptySelection,
  type HistorySelection,
  type SelectionChanges,
} from "../sketch/history-selection.js";
import type { HistoryOperation, OperationHistoryEntry } from "../sketch/operation-history.js";

interface HistoryRecord {
  entry: OperationHistoryEntry;
  change?: { before: SketchDocument; after: SketchDocument };
  selection?: { before: HistorySelection; after: HistorySelection };
}

/** One attempted-operation history. Only entries with an active change navigate. */
export class DocumentStore {
  constructor(private accepted: SketchDocument = { units: "mm", sketches: [] }) {}
  private records: HistoryRecord[] = [];
  selection = emptySelection();
  selections(changes: SelectionChanges): void {
    const latest = [...this.records].reverse().find((r) => r.entry.state === "applied");
    this.selection = structuredClone(changes.baseline);
    if (latest?.selection) latest.selection.after = this.selection;
    for (const next of changes.steps) {
      if (JSON.stringify(next) === JSON.stringify(this.selection)) continue;
      this.supersede();
      const after = structuredClone(next);
      this.records.push({
        entry: {
          ...this.entry({ kind: "selection", parameters: {} }, "changed"),
          state: "applied",
        },
        selection: { before: this.selection, after },
      });
      this.selection = after;
    }
  }
  private supersede(): void {
    for (const record of this.records) {
      if (record.entry.state !== "undone") continue;
      record.entry.state = "superseded";
      delete record.change;
      delete record.selection;
    }
  }
  get data(): SketchDocument {
    return this.accepted;
  }
  get history(): OperationHistoryEntry[] {
    return structuredClone(this.records.map((record) => record.entry));
  }
  get canUndo(): boolean {
    return this.records.some((record) => record.entry.state === "applied");
  }
  get canRedo(): boolean {
    return this.records.some((record) => record.entry.state === "undone");
  }
  record(
    operation: HistoryOperation,
    outcome: "noop" | "failed" | "cancelled",
    error?: string,
  ): void {
    this.records.push({ entry: this.entry(operation, outcome, error) });
  }
  accept(
    candidate: SketchDocument,
    operation: HistoryOperation = { kind: "accept", parameters: {} },
  ): boolean {
    for (const sketch of candidate.sketches) validateSketch(sketch);
    if (JSON.stringify(candidate) === JSON.stringify(this.accepted)) {
      this.record(operation, "noop");
      return false;
    }
    this.supersede();
    for (const record of this.records) {
      if (record.entry.operation.kind !== "selection") continue;
      record.entry.state = "superseded";
      delete record.selection;
    }
    this.records.push({
      entry: { ...this.entry(operation, "changed"), state: "applied" },
      change: { before: this.accepted, after: candidate },
      selection: { before: this.selection, after: this.selection },
    });
    this.accepted = candidate;
    return true;
  }
  undo(): void {
    const record = [...this.records].reverse().find((record) => record.entry.state === "applied");
    if (!record) return;
    if (record.change) this.accepted = record.change.before;
    if (record.selection) this.selection = record.selection.before;
    record.entry.state = "undone";
  }
  redo(): void {
    const record = this.records.find((record) => record.entry.state === "undone");
    if (!record) return;
    if (record.change) this.accepted = record.change.after;
    if (record.selection) this.selection = record.selection.after;
    record.entry.state = "applied";
  }
  private entry(
    operation: HistoryOperation,
    outcome: OperationHistoryEntry["outcome"],
    error?: string,
  ): OperationHistoryEntry {
    return {
      id: this.records.length + 1,
      timestamp: new Date().toISOString(),
      operation: structuredClone(operation),
      outcome,
      state: null,
      ...(error ? { error } : {}),
    };
  }
}
