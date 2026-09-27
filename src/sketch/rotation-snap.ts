/** Quantize pointer rotation in degrees; numeric entry remains exact. */
export function snapRotation(angle: number, shift: boolean): number {
  const step = shift ? 0.5 : 5;
  return Math.round(angle / step) * step;
}
