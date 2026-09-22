import type { AngleConstraint, Segment, Sketch } from "./document.js";
import { distance } from "./geometry.js";
import { movePoint } from "./line-edit.js";
export const wrapDegrees = (angle: number): number =>
  (Math.atan2(Math.sin((angle * Math.PI) / 180), Math.cos((angle * Math.PI) / 180)) * 180) /
  Math.PI;
export function rayAngle(line: Segment, end: "a" | "b"): number {
  const to = line[end === "a" ? "b" : "a"],
    from = line[end];
  return (Math.atan2(to.y - from.y, to.x - from.x) * 180) / Math.PI;
}
export function measuredAngle(sketch: Sketch, c: AngleConstraint): number {
  const a = sketch.curves.find((p) => p.id === c.a),
    b = sketch.curves.find((p) => p.id === c.b);
  if (a?.kind !== "segment" || b?.kind !== "segment")
    throw new Error("Angle requires two line segments");
  return wrapDegrees(rayAngle(b, c.bEnd) - rayAngle(a, c.aEnd));
}
export function meetingAngle(a: Segment, b: Segment): AngleConstraint | null {
  for (const aEnd of ["a", "b"] as const)
    for (const bEnd of ["a", "b"] as const)
      if (distance(a[aEnd], b[bEnd]) < 1e-7)
        return {
          id: "",
          kind: "corner-angle",
          a: a.id,
          b: b.id,
          aEnd,
          bEnd,
          value: wrapDegrees(rayAngle(b, bEnd) - rayAngle(a, aEnd)),
        };
  return null;
}
export function cornerLock(sketch: Sketch, corner: AngleConstraint): AngleConstraint | undefined {
  return sketch.constraints.find(
    (c): c is AngleConstraint =>
      c.kind === "corner-angle" && [c.a, c.b].every((id) => id === corner.a || id === corner.b),
  );
}
export function editCorner(sketch: Sketch, corner: AngleConstraint, degrees: number): Sketch {
  if (!Number.isFinite(degrees) || degrees < 0 || degrees > 180)
    throw new Error("Enter an angle from 0 to 180 degrees");
  const a = sketch.curves.find((c) => c.id === corner.a),
    b = sketch.curves.find((c) => c.id === corner.b);
  if (a?.kind !== "segment" || b?.kind !== "segment")
    throw new Error("Angle requires two line segments");
  const signed = (Math.sign(corner.value) || 1) * degrees;
  const direction = ((rayAngle(b, corner.bEnd) - signed) * Math.PI) / 180;
  const from = a[corner.aEnd],
    length = distance(a.a, a.b);
  const changed = movePoint(
    sketch,
    { curve: a.id, end: corner.aEnd === "a" ? "b" : "a" },
    { x: from.x + length * Math.cos(direction), y: from.y + length * Math.sin(direction) },
  );
  const lock = cornerLock(sketch, corner);
  return lock
    ? {
        ...changed,
        constraints: changed.constraints.map((c) =>
          c.id === lock.id ? { ...lock, value: measuredAngle(changed, lock) } : c,
        ),
      }
    : changed;
}
