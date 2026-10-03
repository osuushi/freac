import type { CurveSpan } from "./curve-spans.js";
import type { Profile } from "./profiles.js";

/** Arrangement faces share canonical spans, including the boundaries of holes. */
export function connectedProfiles(profiles: readonly Profile[], seed: Profile): Profile[] {
  const spans = (profile: Profile) => [...profile.outer, ...profile.holes.flat()];
  const sharesSpan = (a: CurveSpan, b: CurveSpan) =>
    a.curve.id === b.curve.id &&
    Math.min(Math.max(a.start, a.end), Math.max(b.start, b.end)) >
      Math.max(Math.min(a.start, a.end), Math.min(b.start, b.end));
  const result = [seed];
  const remaining = new Set(profiles.filter((p) => p.key !== seed.key));
  for (let i = 0; i < result.length; i++) {
    const boundary = spans(result[i]);
    for (const candidate of remaining) {
      if (!spans(candidate).some((a) => boundary.some((b) => sharesSpan(a, b)))) continue;
      result.push(candidate);
      remaining.delete(candidate);
    }
  }
  return result;
}
