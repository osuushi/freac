import type { Arc } from "./document.js";
import { type FilletCorner, filletShape } from "./fillet-geometry.js";

// Screen-sized hints need not fit a small curved corner. Reduce only the hint;
// an explicit radius must still succeed exactly or be rejected by the tool.
export function filletGuideShape(
  corner: FilletCorner,
  radius: number,
  explicit = false,
): { shape: Arc; radius: number } | null {
  for (let attempt = 0; attempt < (explicit ? 1 : 12) && radius > 1e-7; attempt++, radius /= 2) {
    try {
      return { shape: filletShape(corner, radius, "fillet-guide"), radius };
    } catch {
      // No feasible arc at this guide size. Never throw from a viewport redraw.
    }
  }
  return null;
}
