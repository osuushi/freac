import { type GearSettings, gearDimensions, involute } from "./gear-settings.js";

export interface GearProfilePoint {
  angle: number;
  radius: number;
}

/** Sample each involute flank by its roll parameter, retaining tip/root corners. */
export function gearProfile(
  radius: number,
  settings: GearSettings,
  outward: 1 | -1,
  tolerance: number,
): GearProfilePoint[] {
  const d = gearDimensions(radius, settings, outward);
  const low = Math.min(d.tipRadius, d.rootRadius),
    high = Math.max(d.tipRadius, d.rootRadius);
  const width = (r: number) =>
    d.halfWidth +
    involute(d.transversePressure) -
    involute(Math.acos(d.baseRadius / Math.max(r, d.baseRadius)));
  const tooth: GearProfilePoint[] = [];
  const arc = (r: number, a: number, b: number) => {
    const steps = Math.max(
      1,
      Math.ceil((b - a) / (2 * Math.acos(Math.max(-1, 1 - tolerance / r)))),
    );
    for (let i = 0; i < steps; i++) tooth.push({ angle: a + ((b - a) * i) / steps, radius: r });
  };
  const flank: GearProfilePoint[] = [];
  const t0 = Math.sqrt(Math.max(0, (low / d.baseRadius) ** 2 - 1));
  const t1 = Math.sqrt((high / d.baseRadius) ** 2 - 1);
  const steps = Math.max(8, Math.ceil((high - low) / Math.sqrt(tolerance * d.baseRadius)) * 4);
  if (low < d.baseRadius) flank.push({ angle: -width(low), radius: low });
  for (let i = 0; i <= steps; i++) {
    const t = t0 + ((t1 - t0) * i) / steps;
    const r = d.baseRadius * Math.sqrt(1 + t * t);
    flank.push({ angle: -width(r), radius: r });
  }
  arc(low, -Math.PI / settings.teeth, -width(low));
  tooth.push(...flank.slice(0, -1));
  arc(high, -width(high), width(high));
  tooth.push(...[...flank].reverse().map((p) => ({ angle: -p.angle, radius: p.radius })));
  // The first point of this arc is already the last flank point.
  const count = tooth.length;
  arc(low, width(low), Math.PI / settings.teeth);
  tooth.splice(count, 1);
  return Array.from({ length: settings.teeth }, (_, toothIndex) =>
    tooth.map((p) => ({ ...p, angle: p.angle + (toothIndex * 2 * Math.PI) / settings.teeth })),
  ).flat();
}
