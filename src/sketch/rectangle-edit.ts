import type { EditingGroup, Sketch } from "./document.js";
import { add, dot, groupCurves, midpoint, scale, subtract } from "./geometry.js";
import type { Point } from "./planes.js";

export interface RectangleFrame {
  corners: Point[];
  center: Point;
  u: Point;
  v: Point;
  width: number;
  height: number;
}
export function rectangleFrame(sketch: Sketch, group: EditingGroup): RectangleFrame {
  const corners = groupCurves(sketch, group).map((curve) => curve.a);
  const x = subtract(corners[1], corners[0]),
    y = subtract(corners[3], corners[0]);
  const width = Math.hypot(x.x, x.y),
    height = Math.hypot(y.x, y.y);
  return {
    corners,
    center: midpoint(corners[0], corners[2]),
    u: scale(x, 1 / (width || 1)),
    v: scale(y, 1 / (height || 1)),
    width,
    height,
  };
}
export function replaceCorners(sketch: Sketch, group: EditingGroup, corners: Point[]): Sketch {
  return {
    ...sketch,
    curves: sketch.curves.map((curve) => {
      const index = group.members.indexOf(curve.id);
      return index < 0 ? curve : { ...curve, a: corners[index], b: corners[(index + 1) % 4] };
    }),
  };
}
export type RectangleHandle = { kind: "corner" | "edge"; index: number };
export function resizeRectangle(
  sketch: Sketch,
  group: EditingGroup,
  handle: RectangleHandle,
  target: Point,
  symmetric = false,
): Sketch {
  const frame = rectangleFrame(sketch, group),
    origin = frame.corners[0];
  const local = subtract(target, origin);
  let left = 0,
    right = frame.width,
    bottom = 0,
    top = frame.height;
  if (handle.kind === "corner") {
    if (handle.index === 0 || handle.index === 3) left = dot(local, frame.u);
    else right = dot(local, frame.u);
    if (handle.index === 0 || handle.index === 1) bottom = dot(local, frame.v);
    else top = dot(local, frame.v);
  } else {
    if (handle.index === 0) bottom = dot(local, frame.v);
    if (handle.index === 1) right = dot(local, frame.u);
    if (handle.index === 2) top = dot(local, frame.v);
    if (handle.index === 3) left = dot(local, frame.u);
  }
  if (symmetric) {
    if (left !== 0) right = frame.width - left;
    else if (right !== frame.width) left = frame.width - right;
    if (bottom !== 0) top = frame.height - bottom;
    else if (top !== frame.height) bottom = frame.height - top;
  }
  const corners = [
    [left, bottom],
    [right, bottom],
    [right, top],
    [left, top],
  ].map(([x, y]) => add(origin, add(scale(frame.u, x), scale(frame.v, y))));
  return replaceCorners(sketch, group, corners);
}
export function dimensionRectangle(
  sketch: Sketch,
  group: EditingGroup,
  quantity: "width" | "height",
  value: number,
  anchor?: RectangleHandle,
): Sketch {
  if (!Number.isFinite(value) || value <= 0) throw new Error("Enter a positive dimension");
  const frame = rectangleFrame(sketch, group);
  if (anchor) {
    const index = anchor.index;
    const position =
      anchor.kind === "corner"
        ? frame.corners[index]
        : midpoint(frame.corners[index], frame.corners[(index + 1) % 4]);
    const axis = quantity === "width" ? frame.u : frame.v;
    const sign =
      quantity === "width"
        ? index === 0 || index === 3
          ? -1
          : 1
        : anchor.kind === "edge"
          ? index === 0
            ? -1
            : 1
          : index < 2
            ? -1
            : 1;
    const offset = value - (quantity === "width" ? frame.width : frame.height);
    // An edge changes only its normal dimension; the other field uses the center.
    if (anchor.kind === "corner" || (quantity === "width" ? index % 2 === 1 : index % 2 === 0))
      return resizeRectangle(sketch, group, anchor, add(position, scale(axis, sign * offset)));
  }
  const factor = value / (quantity === "width" ? frame.width : frame.height);
  const axis = quantity === "width" ? frame.u : frame.v;
  const corners = frame.corners.map((p) =>
    add(p, scale(axis, dot(subtract(p, frame.center), axis) * (factor - 1))),
  );
  return replaceCorners(sketch, group, corners);
}
