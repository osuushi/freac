/** Debounces the exact candidate check; the owning tool serializes kernel work. */
export class CleanupAvailability {
  private timer: ReturnType<typeof setTimeout> | null = null;
  private state: "none" | "pending" | "available" | "error" = "none";
  constructor(
    private button: HTMLButtonElement,
    private start: () => void,
  ) {}
  reset(pending = false): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    this.state = pending ? "pending" : "none";
  }
  schedule(): void {
    this.reset(true);
    this.timer = setTimeout(() => {
      this.timer = null;
      this.start();
    }, 250);
  }
  resolve(available: boolean, success: boolean): void {
    this.state = !success ? "error" : available ? "available" : "none";
  }
  update(eligible: boolean, busy: boolean): void {
    this.button.disabled = !eligible || busy || this.state !== "available";
    this.button.setAttribute("aria-busy", String(eligible && this.state === "pending"));
    this.button.title =
      this.state === "pending" && eligible
        ? "Checking for redundant topology…"
        : this.state === "error"
          ? "Cleanup check failed · edit the size to retry"
          : this.state === "available" && eligible
            ? "Commit and clean up · remove redundant topology"
            : "Nothing to clean up";
  }
}
