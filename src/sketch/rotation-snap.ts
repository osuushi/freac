/** Quantize a rotation angle in degrees only while Shift is held. */
export function snapRotation(angle: number, shift: boolean, option: boolean): number {
  if (!shift) return angle;
  const step = option ? 0.5 : 5;
  return Math.round(angle / step) * step;
}
