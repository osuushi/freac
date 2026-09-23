import type { CameraFraming } from "./camera-motion.js";
import { boundaryPoints } from "./curve-spans.js";
import type { Sketch } from "./document.js";
import type { SketchEditor } from "./editor.js";
import { worldPoint } from "./planes.js";
import type { Profile } from "./profiles.js";

export function profileFraming(
  editor: SketchEditor,
  sketch: Sketch,
  profile: Profile,
): CameraFraming {
  const world = editor.world,
    unitsPerPixel = world.height / Math.max(1, world.canvas.clientHeight),
    points = boundaryPoints(profile.outer, unitsPerPixel),
    lowX = Math.min(...points.map((point) => point.x)),
    highX = Math.max(...points.map((point) => point.x)),
    lowY = Math.min(...points.map((point) => point.y)),
    highY = Math.max(...points.map((point) => point.y)),
    center = { x: (lowX + highX) / 2, y: (lowY + highY) / 2 },
    aspect = world.canvas.clientWidth / Math.max(1, world.canvas.clientHeight),
    fittedHeight = Math.max(highY - lowY, (highX - lowX) / Math.max(aspect, 1e-6)) * 1.5;
  return {
    target: worldPoint(sketch.plane, center),
    height: Math.max(0.5, Math.min(10000, fittedHeight)),
  };
}
