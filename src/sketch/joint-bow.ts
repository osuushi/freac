import { replaceBow } from "./arc-edit.js";
import { arcCircle, bowRadius } from "./arc-geometry.js";
import { bowDirections } from "./bow-direction.js";
import type { Arc, Segment, Sketch } from "./document.js";
import { bowRectangleSide } from "./rectangle-bow.js";

// One edit value, separate ordinary curves. No implicit equal-radius constraint.
export function jointBow(
  sketch: Sketch,
  sources: readonly (Segment | Arc)[],
  driver: Segment | Arc,
): Sketch {
  if (driver.kind === "segment") return sketch;
  const directions = bowDirections(sketch, sources);
  if (!directions) throw new Error("These edges have no unambiguous shared bow direction");
  const driverDirection = directions.get(driver.id) ?? 1;
  const radius = arcCircle(driver).radius;
  const replacements = sources.map((source) => {
    if (source.id === driver.id) return driver;
    const branch =
      source.kind === "arc"
        ? source
        : {
            ...source,
            kind: "arc" as const,
            bulge:
              Math.sign(driver.bulge) *
              driverDirection *
              (directions.get(source.id) ?? 1) *
              (Math.abs(driver.bulge) > 1 ? 2 : 0.5),
          };
    return bowRadius(branch, radius, -Math.sign(driver.bulge));
  });
  for (const curve of replacements) {
    sketch = sketch.groups.some((g) => g.members.includes(curve.id))
      ? bowRectangleSide(sketch, curve).sketch
      : replaceBow(sketch, curve);
  }
  return sketch;
}
