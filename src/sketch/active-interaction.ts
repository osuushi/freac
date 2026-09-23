import type { SketchDocument } from "./document.js";

type Kind =
  | "entity-reorder"
  | "scale"
  | "transform-box-move"
  | "construction-plane"
  | "plane-cut"
  | "mirror"
  | "cleanup"
  | "shell"
  | "face-offset"
  | "face-move"
  | "edge-move"
  | "body-edge-finish"
  | "body-boolean"
  | "body-move"
  | "projection"
  | "use-edge"
  | "revolve"
  | "extrude"
  | "placement"
  | "model-selection"
  | "pointer"
  | "bezier"
  | "bow"
  | "fillet"
  | "offset"
  | "trim"
  | "numeric";
export class ActiveInteraction {
  private active: InteractionLease | null = null;
  constructor(private changed: () => void) {}
  get current(): InteractionLease | null {
    return this.active;
  }
  get dragging(): boolean {
    return (
      !!this.active &&
      this.active.kind !== "mirror" &&
      this.active.kind !== "numeric" &&
      this.active.kind !== "trim" &&
      this.active.kind !== "use-edge" &&
      this.active.kind !== "projection" &&
      this.active.kind !== "cleanup" &&
      (![
        "revolve",
        "scale",
        "construction-plane",
        "plane-cut",
        "extrude",
        "body-move",
        "body-boolean",
        "body-edge-finish",
        "face-offset",
        "shell",
        "face-move",
        "edge-move",
      ].includes(this.active.kind) ||
        this.active.captured)
    );
  }
  get finishing(): boolean {
    return !!this.active && this.active.phase !== "editing";
  }
  get candidate(): SketchDocument | null {
    return this.active?.candidate ?? null;
  }
  acquire(
    kind: Kind,
    cancel: () => Promise<void> | void,
    finish?: () => Promise<boolean>,
  ): InteractionLease | null {
    if (this.active) return null;
    this.active = new InteractionLease(this, kind, cancel, finish);
    return this.active;
  }
  async cancel(): Promise<void> {
    const active = this.active;
    if (active && active.phase !== "closing") await active.cancel();
  }
  requestCancel(): boolean {
    if (!this.active || this.active.phase === "closing") return false;
    void this.cancel();
    return true;
  }
  release(lease: InteractionLease): void {
    if (this.active !== lease) return;
    this.active = null;
    this.changed();
  }
}
export class InteractionLease {
  phase: "editing" | "waiting" | "closing" = "editing";
  candidate: SketchDocument | null = null;
  private captureTarget: { element: Element; id: number } | null = null;
  private abort = new AbortController();
  constructor(
    private owner: ActiveInteraction,
    readonly kind: Kind,
    readonly cancel: () => Promise<void> | void,
    readonly finish?: () => Promise<boolean>,
  ) {}
  get captured(): boolean {
    return this.captureTarget !== null;
  }
  wait(): boolean {
    if (this.owner.current !== this || this.phase !== "editing") return false;
    this.phase = "waiting";
    return true;
  }
  resume(): void {
    if (this.owner.current === this && this.phase === "waiting") this.phase = "editing";
  }
  close(): boolean {
    if (this.owner.current !== this || this.phase === "closing") return false;
    this.phase = "closing";
    return true;
  }
  show(candidate: SketchDocument | null): void {
    if (this.owner.current === this && (candidate === null || this.phase !== "closing"))
      this.candidate = candidate;
  }
  capture(element: Element, id: number): void {
    this.captureTarget = { element, id };
    element.addEventListener(
      "lostpointercapture",
      (event) => {
        if (this.captureTarget?.id === (event as PointerEvent).pointerId)
          this.owner.requestCancel();
      },
      { signal: this.abort.signal },
    );
    try {
      element.setPointerCapture(id);
    } catch (error) {
      // A queued widget handoff can replay its complete gesture after physical release.
      if (!(error instanceof DOMException && error.name === "NotFoundError")) throw error;
    }
  }
  releaseCapture(): void {
    const capture = this.captureTarget;
    this.captureTarget = null;
    if (capture?.element.hasPointerCapture(capture.id))
      capture.element.releasePointerCapture(capture.id);
  }
  release(): void {
    this.abort.abort();
    this.releaseCapture();
    this.owner.release(this);
  }
}
