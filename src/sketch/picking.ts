import { bowGuides } from "./arc-edit.js";
import { arcAt, arcCircle } from "./arc-geometry.js";
import { bezierAt } from "./bezier-geometry.js";
import { closestOnCurve, curveDistance } from "./curve-geometry.js";
import type { EditingGroup, Endpoint, Sketch } from "./document.js";
import type { SketchEditor } from "./editor.js";
import { distance, dot, midpoint, subtract } from "./geometry.js";
import type { Point } from "./planes.js";
import { type RectangleHandle, rectangleFrame } from "./rectangle-edit.js";
import { selectionFrame } from "./selection-frame.js";
import { sketchRotationVisible, transformHandles } from "./transform-handles.js";

export type Hit =
  | { kind: "translate"; axis: "x" | "y"; point: Point }
  | { kind: "bow"; curve: string; side: number; point: Point }
  | { kind: "handle"; group: EditingGroup; handle: RectangleHandle; point: Point }
  | { kind: "group"; group: EditingGroup; point: Point }
  | { kind: "curve"; curve: string; point: Point; group?: EditingGroup }
  | { kind: "endpoint"; endpoint: Endpoint; point: Point }
  | { kind: "midpoint"; curve: string; point: Point }
  | { kind: "center"; group: EditingGroup; point: Point }
  | { kind: "circleCenter" | "circleBody"; curve: string; point: Point }
  | { kind: "rotate"; point: Point };
export const hitIds = (hit: Hit): readonly string[] =>
  hit.kind === "rotate" || hit.kind === "translate"
    ? []
    : hit.kind === "endpoint"
      ? [hit.endpoint.curve]
      : "curve" in hit
        ? [hit.curve]
        : hit.group.members;
export function rectangleHandles(sketch: Sketch, group: EditingGroup) {
  const frame = rectangleFrame(sketch, group);
  return [
    ...frame.corners.map((point, index) => ({ point, handle: { kind: "corner" as const, index } })),
    ...frame.corners.map((point, index) => ({
      point: midpoint(point, frame.corners[(index + 1) % 4]),
      handle: { kind: "edge" as const, index },
    })),
  ];
}

function selectedHandle(editor: SketchEditor, screen: Point): Hit | null {
  const sketch = editor.sketch;
  if (!sketch) return null;
  const project = (point: Point) => editor.world.projectLocal(sketch.plane, point);
  const local = editor.world.pointAt(sketch.plane, screen.x, screen.y);
  const unit = editor.world.height / editor.world.canvas.clientHeight;
  const guides = bowGuides(editor).sort(
    (a, b) => distance(project(a.point), screen) - distance(project(b.point), screen),
  );
  for (const guide of guides) {
    const line = sketch.curves.find((c) => c.id === guide.curve);
    const guideDistance = distance(project(guide.point), screen);
    // Shallow multi-bow guides can be only a few pixels off a short edge.
    // Their hit radius must not swallow the nearer edge or its midpoint.
    const midpointHit =
      guideDistance <= 9 &&
      (line?.kind !== "segment" || !local || guideDistance < curveDistance(line, local) / unit);
    const guideHit =
      local &&
      line &&
      line.kind !== "circle" &&
      distance(project(line.a), screen) > 12 &&
      distance(project(line.b), screen) > 12 &&
      curveDistance(line, local) > 6 * unit &&
      curveDistance(guide.shape, local) < 4 * unit;
    if (midpointHit || guideHit) return { kind: "bow", ...guide };
  }
  const widget = transformHandles(editor);
  if (widget) {
    for (const handle of widget.axes)
      if (distance(project(handle.point), screen) <= 22) return { kind: "translate", ...handle };
    if (widget.rotationVisible && distance(project(widget.rotation), screen) <= 17 && local)
      return { kind: "rotate", point: widget.rotation };
  }
  const selection = selectionFrame(editor);
  if (
    !widget &&
    !editor.circle &&
    selection &&
    sketchRotationVisible(editor) &&
    distance(project(selection.handle), screen) <= 17
  )
    return { kind: "rotate", point: selection.handle };
  const group = editor.rectangleContext;
  if (group) {
    for (const { point, handle } of rectangleHandles(sketch, group))
      if (distance(project(point), screen) <= 8) return { kind: "handle", group, handle, point };
    const center = rectangleFrame(sketch, group).center;
    if (distance(project(center), screen) <= 8) return { kind: "center", group, point: center };
  }
  return null;
}
export function pickCandidates(editor: SketchEditor, screen: Point): Hit[] {
  const sketch = editor.sketch;
  if (!sketch) return [];
  const handle = selectedHandle(editor, screen);

  const project = (point: Point) => editor.world.projectLocal(sketch.plane, point);
  const points = pointHits(sketch);
  const nearby = points
    .filter((hit) => distance(project(hit.point), screen) <= 8)
    .sort((a, b) => distance(project(a.point), screen) - distance(project(b.point), screen));
  if (
    handle &&
    !(
      handle.kind === "rotate" &&
      nearby[0] &&
      distance(project(nearby[0].point), screen) < distance(project(handle.point), screen)
    )
  )
    return [handle];
  if (nearby.length) return [nearby[0]];
  const local = editor.world.pointAt(sketch.plane, screen.x, screen.y);
  if (!local) return [];
  const pixelsPerUnit = editor.world.canvas.clientHeight / editor.world.height;
  const near = sketch.curves
    .map((curve) => ({
      curve,
      distance: curveDistance(curve, local) * pixelsPerUnit,
    }))
    .filter((hit) => hit.distance <= 8)
    .sort((a, b) => a.distance - b.distance || a.curve.id.localeCompare(b.curve.id));
  if (near.length) {
    const seen = new Set<string>();
    return near
      .filter((hit) => hit.distance <= near[0].distance + 1)
      .flatMap(({ curve }): Hit[] => {
        const group = sketch.groups.find((item) => item.members.includes(curve.id)),
          key = group?.id ?? curve.id;
        if (seen.has(key)) return [];
        seen.add(key);
        return [
          {
            kind: "curve",
            curve: curve.id,
            point: closestOnCurve(curve, local),
            group,
          },
        ];
      });
  }
  const interiors = sketch.curves.flatMap((curve): Hit[] =>
    curve.kind === "circle" && distance(local, curve.center) < curve.radius
      ? [{ kind: "circleBody", curve: curve.id, point: curve.center }]
      : [],
  );
  return [
    ...interiors,
    ...sketch.groups
      .map((group) => ({ group, frame: rectangleFrame(sketch, group) }))
      .filter(({ frame }) => {
        const relative = subtract(local, frame.corners[0]),
          x = dot(relative, frame.u),
          y = dot(relative, frame.v);
        return x > 0 && x < frame.width && y > 0 && y < frame.height;
      })
      .sort((a, b) => a.frame.width * a.frame.height - b.frame.width * b.frame.height)
      .map(({ group, frame }): Hit => ({ kind: "group", group, point: frame.center })),
  ];
}
export const pick = (editor: SketchEditor, screen: Point): Hit | null =>
  pickCandidates(editor, screen)[0] ?? null;

export function pointKey(hit: Hit | null): string | null {
  if (!hit) return null;
  if (hit.kind === "endpoint") return `${hit.endpoint.curve}/${hit.endpoint.end}`;
  if (hit.kind === "midpoint") return `${hit.curve}/midpoint`;
  if (hit.kind === "circleCenter") return `${hit.curve}/center`;
  if (hit.kind === "center") return `${hit.group.id}/center`;
  if (hit.kind === "handle") return `${hit.group.id}/${hit.handle.kind}/${hit.handle.index}`;
  return null;
}

export function pointHits(sketch: Sketch): Hit[] {
  const points: Hit[] = sketch.curves.flatMap((curve): Hit[] => {
    const group = sketch.groups.find((item) => item.members.includes(curve.id));
    if (group) return [];
    if (curve.kind === "circle")
      return [{ kind: "circleCenter", curve: curve.id, point: curve.center }];
    if (curve.kind === "arc")
      return [
        { kind: "endpoint", endpoint: { curve: curve.id, end: "a" }, point: curve.a },
        { kind: "endpoint", endpoint: { curve: curve.id, end: "b" }, point: curve.b },
        { kind: "circleCenter", curve: curve.id, point: arcCircle(curve).center },
        { kind: "midpoint", curve: curve.id, point: arcAt(curve, 0.5) },
      ];
    return [
      { kind: "endpoint", endpoint: { curve: curve.id, end: "a" }, point: curve.a },
      { kind: "endpoint", endpoint: { curve: curve.id, end: "b" }, point: curve.b },
      {
        kind: "midpoint",
        curve: curve.id,
        point: curve.kind === "bezier" ? bezierAt(curve, 0.5) : midpoint(curve.a, curve.b),
      },
    ];
  });
  for (const group of sketch.groups) {
    for (const { point, handle } of rectangleHandles(sketch, group))
      points.push({ kind: "handle", group, handle, point });
    points.push({ kind: "center", group, point: rectangleFrame(sketch, group).center });
  }
  return points;
}
