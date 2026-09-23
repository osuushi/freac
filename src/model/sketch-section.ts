import { spanArea } from "../sketch/curve-spans.js";
import { type Curve, emptySketch } from "../sketch/document.js";
import type { PlaneFrame } from "../sketch/planes.js";
import { profilesFor } from "../sketch/profiles.js";

export interface SketchSection {
  body: string;
  curves: Curve[];
}

/** One exact planar face has one exterior loop, plus zero or more holes. */
export function sectionProfile(section: SketchSection, frame: PlaneFrame) {
  const sketch = {
    ...emptySketch(frame),
    curves: section.curves.map((curve, i) => ({ ...curve, id: `section-${i}` })),
  };
  return profilesFor(sketch).sort(
    (a, b) =>
      b.outer.reduce((sum, span) => sum + spanArea(span), 0) -
      a.outer.reduce((sum, span) => sum + spanArea(span), 0),
  )[0];
}
