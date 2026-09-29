/** Opt-in, sequential wall-clock stages for the export benchmark. */
export class ExportTiming {
  readonly milliseconds: Record<string, number> = {};
  private previous = performance.now();

  mark(stage: string): void {
    const now = performance.now();
    this.milliseconds[stage] = (this.milliseconds[stage] ?? 0) + now - this.previous;
    this.previous = now;
  }
}
