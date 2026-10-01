import type { DisplayDocument } from "../model/display-document.js";

type Kind =
  | "tag-membership"
  | "entity-reorder"
  | "scale"
  | "transform-box-move"
  | "cross-section"
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
  | "loft"
  | "revolve"
  | "extrude"
  | "placement"
  | "selection-choice"
  | "model-selection"
  | "pointer"
  | "bezier"
  | "bow"
  | "fillet"
  | "offset"
  | "trim"
  | "numeric";
interface InteractionCapabilities {
  /** Captured gestures always exclude navigation, including otherwise settled tools. */
  navigation: "blocked" | "when-released";
}
export class ActiveInteraction {
  private active: InteractionLease | null = null;
  constructor(private changed: () => void) {}
  get current(): InteractionLease | null {
    return this.active;
  }
  get dragging(): boolean {
    return !!this.active && (!this.active.navigationAllowed || this.active.captured);
  }
  get finishing(): boolean {
    return !!this.active && this.active.phase !== "editing";
  }
  get candidate(): DisplayDocument | null {
    return this.active?.candidate ?? null;
  }
  acquire(
    kind: Kind,
    cancel: () => Promise<void> | void,
    finish?: () => Promise<boolean>,
    capabilities: InteractionCapabilities = { navigation: "blocked" },
  ): InteractionLease | null {
    if (this.active) return null;
    this.active = new InteractionLease(this, kind, cancel, finish, capabilities);
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
  readonly navigationAllowed: boolean;
  phase: "editing" | "waiting" | "closing" = "editing";
  candidate: DisplayDocument | null = null;
  private captureTarget: { element: Element; id: number } | null = null;
  private abort = new AbortController();
  constructor(
    private owner: ActiveInteraction,
    readonly kind: Kind,
    readonly cancel: () => Promise<void> | void,
    readonly finish?: () => Promise<boolean>,
    capabilities: InteractionCapabilities = { navigation: "blocked" },
  ) {
    this.navigationAllowed = capabilities.navigation === "when-released";
  }
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
  show(candidate: DisplayDocument | null): void {
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
