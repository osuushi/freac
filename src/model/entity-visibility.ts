import type { SketchDocument } from "../sketch/document.js";
import type { HistoryOperation } from "../sketch/operation-history.js";
import { profilesFor } from "../sketch/profiles.js";
import type { Extrusion, LiftSource, Revolution } from "./body.js";

/** Per-window display state; hiding geometry never changes the document. */
export class EntityVisibility {
  readonly hidden = new Set<string>();
  setUsedSketchesVisible(
    document: SketchDocument,
    sources: readonly LiftSource[],
    visible: boolean,
  ): void {
    for (const sketch of document.sketches) {
      const used = new Set(
        sources.flatMap((source) =>
          "sketch" in source && source.sketch === sketch.id ? [source.profile] : [],
        ),
      );
      if (!used.size) continue;
      const profiles = profilesFor(sketch);
      if (profiles.length && profiles.every((profile) => used.has(profile.key))) {
        if (visible) this.hidden.delete(sketch.id);
        else this.hidden.add(sketch.id);
      }
    }
  }
  restoreHistory(
    document: SketchDocument,
    operation: HistoryOperation,
    direction: "undo" | "redo",
  ): void {
    const sweep =
      operation.kind === "extrude"
        ? (operation.parameters.extrusion as Extrusion)
        : operation.kind === "revolve"
          ? (operation.parameters.revolution as Revolution)
          : undefined;
    if (sweep) this.setUsedSketchesVisible(document, sweep.sources, direction === "undo");
  }
  visible(id: string): boolean {
    return !this.hidden.has(id);
  }
  get key(): string {
    return [...this.hidden].join(",");
  }
}
