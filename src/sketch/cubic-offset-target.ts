import { type Curve, emptySketch } from "./document.js";
import { hasClosedEndpoints } from "./loop-boundary.js";
import { planes } from "./planes.js";
import { profilesFor } from "./profiles.js";

/** One complete selected loop, not a bounded cell cut out of crossing curves. */
export function cubicOffsetProfile(curves: readonly Curve[]) {
  if (!hasClosedEndpoints(curves)) throw new Error("Select one closed loop for cubic offset");
  const profiles = profilesFor({ ...emptySketch(planes.XY), curves: [...curves] });
  const profile = profiles[0];
  if (profiles.length !== 1 || !profile || profile.holes.length)
    throw new Error("Offset requires one simple closed loop");
  const used = new Set(profile.outer.map((span) => span.curve.id));
  if (used.size !== curves.length) throw new Error("Offset requires one complete closed loop");
  return profile;
}
