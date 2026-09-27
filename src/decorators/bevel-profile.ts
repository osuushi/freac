import type { Face } from "../model/body.js";
import { cross, unit } from "./cylinder.js";
import type { GearProfilePoint } from "./gear-profile.js";
import { type GearSettings, radians } from "./gear-settings.js";

/** Spherical involute from a great-circle tangent unwrapped from the base cone. */
export function sphericalInvolute(delta: number, base: number): number {
  const roll = Math.acos(Math.min(1, Math.cos(delta) / Math.cos(base)));
  return roll / Math.sin(base) - Math.atan2(Math.sin(roll), Math.sin(base) * Math.cos(roll));
}

export function bevelFrame(cone: NonNullable<Face["cone"]>) {
  const axis = cone.axis;
  const u = unit(cross(axis, Math.abs(axis[0]) < 0.8 ? [1, 0, 0] : [0, 1, 0]));
  return { origin: cone.apex, u, v: cross(axis, u) };
}

export function bevelProfile(
  cone: NonNullable<Face["cone"]>,
  settings: GearSettings,
  tolerance: number,
  axialMaximum: number,
  referenceAxial = axialMaximum,
) {
  if (settings.helix)
    throw new Error("Conic gears use straight bevel teeth; spiral bevel is not supported");
  const delta = radians(cone.semiAngle),
    alpha = radians(settings.pressure);
  if (delta < radians(3) || delta > radians(80))
    throw new Error("Bevel pitch angle must be between 3° and 80°");
  const base = Math.asin(Math.sin(delta) * Math.cos(alpha));
  const angularModule = (2 * Math.sin(delta)) / settings.teeth;
  const tip = delta + cone.outward * Math.atan(angularModule * (1 + cone.outward * settings.shift));
  const root =
    delta -
    cone.outward *
      Math.atan(angularModule * (1 + settings.clearance - cone.outward * settings.shift));
  const low = Math.min(tip, root),
    high = Math.max(tip, root);
  if (low <= 0 || high >= Math.PI / 2)
    throw new Error("Bevel tooth envelope reaches the axis or equator");
  if (cone.outward < 0 && tip < base)
    throw new Error("Internal bevel tips reach below the base cone; increase tooth count");
  const minimumTeeth = (2 * Math.cos(delta) * (1 - settings.shift)) / Math.sin(alpha) ** 2;
  if (cone.outward > 0 && settings.teeth < minimumTeeth)
    throw new Error("Bevel teeth require undercut; increase tooth count");
  const half =
    Math.PI / (2 * settings.teeth) +
    (2 * settings.shift * Math.tan(alpha)) / settings.teeth -
    (cone.outward * settings.thinning) / (2 * referenceAxial * Math.tan(delta));
  const width = (d: number) =>
    half + sphericalInvolute(delta, base) - sphericalInvolute(Math.max(base, d), base);
  if (width(high) <= 1e-5 || width(low) >= Math.PI / settings.teeth)
    throw new Error("Bevel teeth are pointed or overlap");
  const tooth: GearProfilePoint[] = [];
  const arc = (d: number, a: number, b: number) => {
    const radius = Math.tan(d);
    const count = Math.max(1, Math.ceil((b - a) / Math.sqrt(tolerance / (radius * axialMaximum))));
    if (count * settings.teeth > 100_000) throw new Error("Bevel gear exceeds the mesh budget");
    for (let i = 0; i < count; i++) tooth.push({ angle: a + ((b - a) * i) / count, radius });
  };
  const flank: GearProfilePoint[] = [];
  const count = Math.max(16, Math.ceil((high - low) * Math.sqrt(axialMaximum / tolerance)) * 4);
  if (count * settings.teeth > 100_000) throw new Error("Bevel gear exceeds the mesh budget");
  if (low < base) flank.push({ angle: -width(low), radius: Math.tan(low) });
  for (let i = 0; i <= count; i++) {
    const d = Math.max(base, low) + ((high - Math.max(base, low)) * i) / count;
    flank.push({ angle: -width(d), radius: Math.tan(d) });
  }
  arc(low, -Math.PI / settings.teeth, -width(low));
  tooth.push(...flank.slice(0, -1));
  arc(high, -width(high), width(high));
  tooth.push(...[...flank].reverse().map((p) => ({ angle: -p.angle, radius: p.radius })));
  const last = tooth.length;
  arc(low, width(low), Math.PI / settings.teeth);
  tooth.splice(last, 1);
  const profile = Array.from({ length: settings.teeth }, (_, i) =>
    tooth.map((p) => ({ ...p, angle: p.angle + (2 * Math.PI * i) / settings.teeth })),
  ).flat();
  return {
    profile,
    low: Math.tan(low),
    high: Math.tan(high),
    pitch: Math.tan(delta),
    baseAngle: base,
  };
}
