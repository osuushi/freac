import type { World } from "./world.js";

/** Pinch and native twist settle together, after their last input has gone quiet. */
export class TrackpadSnap {
  private timer: ReturnType<typeof setTimeout> | null = null;
  private held = false;
  private pending = false;
  constructor(
    private world: World,
    signal: AbortSignal,
  ) {
    window.addEventListener("pointerdown", this.cancel, { capture: true, signal });
    window.addEventListener("blur", this.cancel, { signal });
    window.addEventListener(
      "keydown",
      (event) => {
        if (event.key === "Escape") this.cancel();
      },
      { capture: true, signal },
    );
    signal.addEventListener("abort", this.cancel, { once: true });
  }
  private clearTimer(): void {
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = null;
  }
  cancel = (): void => {
    this.clearTimer();
    this.held = false;
    this.pending = false;
  };
  hold(): void {
    this.clearTimer();
    this.held = true;
  }
  release(): void {
    this.held = false;
    this.postpone();
  }
  request(): void {
    this.pending = true;
    this.postpone();
  }
  postpone(): void {
    this.clearTimer();
    if (!this.pending || this.held) return;
    this.timer = setTimeout(() => {
      this.timer = null;
      this.pending = false;
      if (this.world.canNavigate() && !this.world.orbit.active) this.world.levelHorizon();
    }, 200);
  }
}
