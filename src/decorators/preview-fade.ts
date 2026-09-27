const fadeInMs = 100;
const fadeOutMs = 200;

const fraction = (value: number) => Math.max(0, Math.min(1, value));

/** One generated preview's visibility across document changes and replacements. */
export class PreviewFade {
  private staleAt: number | null = null;
  private replacedAt: number | null = null;
  private replacementOpacity = 0;
  private recoveryAt: number | null = null;
  private recoveryOpacity = 0;

  constructor(readonly addedAt: number) {}

  stale(now: number): void {
    if (this.staleAt === null) {
      this.recoveryAt = null;
      this.staleAt = now;
    }
  }

  restore(now: number): void {
    if (this.staleAt === null || this.replacedAt !== null) return;
    this.recoveryOpacity = this.opacity(now);
    this.recoveryAt = now;
    this.staleAt = null;
  }

  replace(now: number): void {
    if (this.replacedAt !== null) return;
    this.replacementOpacity = this.opacity(now);
    this.replacedAt = now;
  }

  get current(): boolean {
    return this.replacedAt === null;
  }

  opacity(now: number): number {
    if (this.replacedAt !== null)
      return this.replacementOpacity * (1 - fraction((now - this.replacedAt) / fadeOutMs));
    if (this.recoveryAt !== null)
      return (
        this.recoveryOpacity +
        (1 - this.recoveryOpacity) * fraction((now - this.recoveryAt) / fadeInMs)
      );
    const arriving = fraction((now - this.addedAt) / fadeInMs);
    if (this.staleAt === null) return arriving;
    const fadingAt = Math.max(this.staleAt, this.addedAt + fadeInMs);
    if (now < fadingAt) return arriving;
    return 1 - fraction((now - fadingAt) / fadeOutMs);
  }

  animating(now: number): boolean {
    if (this.replacedAt !== null) return now < this.replacedAt + fadeOutMs;
    if (this.recoveryAt !== null) return now < this.recoveryAt + fadeInMs;
    if (this.staleAt !== null)
      return now < Math.max(this.staleAt, this.addedAt + fadeInMs) + fadeOutMs;
    return now < this.addedAt + fadeInMs;
  }
}
