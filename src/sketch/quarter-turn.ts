/** One deliberate two-finger twist becomes one quarter turn, until the gesture ends. */
export class QuarterTurn {
  private angle = 0;
  private fired = false;
  reset(): void {
    this.angle = 0;
    this.fired = false;
  }
  update(radians: number): number {
    if (this.fired || !Number.isFinite(radians)) return 0;
    this.angle += radians;
    if (Math.abs(this.angle) < Math.PI / 12) return 0;
    this.fired = true;
    return (Math.sign(this.angle) * Math.PI) / 2;
  }
}
