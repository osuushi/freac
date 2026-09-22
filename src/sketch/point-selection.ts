import type { Curve, Sketch } from "./document.js";
import type { SketchEditor } from "./editor.js";
import { distance } from "./geometry.js";
import { type Hit, pointHits, pointKey } from "./picking.js";
import type { Point } from "./planes.js";

import { pointTarget, type SelectionTarget, targetKey } from "./selected-targets.js";

export interface PointMenu {
  hits: Hit[];
  inspect?: boolean;
  screen: Point;
}
export function colocated(sketch: Sketch, hit: Hit): Hit[] {
  return pointKey(hit) ? pointHits(sketch).filter((p) => distance(p.point, hit.point) <= 1e-7) : [];
}
export function chosenPoints(editor: SketchEditor, hit: Hit): Hit[] {
  const sketch = editor.sketch;
  if (!sketch) return [];
  const all = colocated(sketch, hit);
  const chosen = all.filter((p) => editor.pointChoice?.has(pointKey(p) ?? ""));
  return chosen.length ? chosen : all;
}
export function openPointMenu(
  editor: SketchEditor,
  hit: Hit,
  screen: Point,
  inspect = false,
): void {
  if (!editor.sketch || !pointKey(hit)) return;
  const selected = selectedPointHits(editor);
  const separated =
    selected.length > 1 && selected.some((p) => distance(p.point, hit.point) > 1e-7);
  const hits =
    separated && selected.some((p) => pointKey(p) === pointKey(hit))
      ? selected
      : colocated(editor.sketch, hit);
  if (hits.length < 2) return;
  if (
    editor.pointMenu?.hits.map(pointKey).join() === hits.map(pointKey).join() &&
    editor.pointMenu?.inspect === inspect
  )
    return;
  editor.pointMenu = { hits, screen, inspect };
  editor.overlaps = null;
}
export function choosePoints(
  editor: SketchEditor,
  hits: Hit[],
  curves: Iterable<string> = [],
): void {
  const previous = editor.selected.targets;
  const ids = new Set(curves);
  const groups = previous.filter(
    (t) =>
      t.kind === "group" &&
      editor.sketch?.groups.find((g) => g.id === t.group)?.members.every((id) => ids.has(id)),
  );
  const grouped = new Set(
    groups.flatMap((t) =>
      t.kind === "group"
        ? (editor.sketch?.groups.find((g) => g.id === t.group)?.members ?? [])
        : [],
    ),
  );
  const targets: SelectionTarget[] = [
    ...groups,
    ...[...ids]
      .filter((id) => !grouped.has(id))
      .map((curve) => ({ kind: "curve" as const, curve })),
    ...hits.flatMap((hit) => {
      const target = pointTarget(hit);
      return target ? [target] : [];
    }),
  ];
  const keys = new Set(targets.map(targetKey));
  const oldKeys = new Set(previous.map(targetKey));
  editor.selectTargets([
    ...previous.filter((t) => keys.has(targetKey(t))),
    ...targets.filter((t) => !oldKeys.has(targetKey(t))),
  ]);
  editor.tool = "select";
  editor.creationArmed = false;
}
export function pointSelected(editor: SketchEditor, key: string): boolean {
  return editor.pointChoice?.has(key) ?? editor.selectedPoint === key;
}
export interface PointBranch {
  curve: string;
  fraction: number | null;
}
export function pointBranches(hit: Hit): PointBranch[] {
  if (hit.kind === "endpoint")
    return [{ curve: hit.endpoint.curve, fraction: hit.endpoint.end === "a" ? 0 : 1 }];
  if (hit.kind === "midpoint") return [{ curve: hit.curve, fraction: 0.5 }];
  if (hit.kind === "circleCenter") return [{ curve: hit.curve, fraction: null }];
  if (hit.kind === "center") return hit.group.members.map((curve) => ({ curve, fraction: null }));
  if (hit.kind === "handle") {
    const members = hit.group.members,
      i = hit.handle.index;
    return hit.handle.kind === "edge"
      ? [{ curve: members[i], fraction: 0.5 }]
      : [
          { curve: members[i], fraction: 0 },
          { curve: members[(i + members.length - 1) % members.length], fraction: 1 },
        ];
  }
  return [];
}

export function selectedPointHits(editor: SketchEditor, sketch = editor.sketch): Hit[] {
  if (!sketch) return [];
  const available = pointHits(sketch);
  const keys = editor.pointChoice ?? new Set(editor.selectedPoint ? [editor.selectedPoint] : []);
  return [...keys].flatMap((key) => {
    const hit = available.find((p) => pointKey(p) === key);
    return hit ? [hit] : [];
  });
}

/** The two distinct edges at the one selected physical degree-two endpoint junction. */
export function tangentPointPair(sketch: Sketch, selected: readonly Hit[]): [Curve, Curve] | null {
  const endpoints = selected.filter(
    (hit): hit is Extract<Hit, { kind: "endpoint" }> => hit.kind === "endpoint",
  );
  if (
    endpoints.length !== 2 ||
    endpoints.some((hit) => distance(hit.point, endpoints[0].point) > 1e-7)
  )
    return null;
  const incident = pointHits(sketch).filter(
    (hit): hit is Extract<Hit, { kind: "endpoint" }> =>
      hit.kind === "endpoint" && distance(hit.point, endpoints[0].point) <= 1e-7,
  );
  const selectedKeys = new Set(endpoints.map(pointKey));
  if (incident.length !== 2 || incident.some((hit) => !selectedKeys.has(pointKey(hit))))
    return null;
  const curves = endpoints.flatMap((hit) => {
    const curve = sketch.curves.find((curve) => curve.id === hit.endpoint.curve);
    return curve ? [curve] : [];
  });
  return curves.length === 2 && curves[0].id !== curves[1].id ? [curves[0], curves[1]] : null;
}
export function togglePoint(editor: SketchEditor, hit: Hit, toggle = true): void {
  const selected = selectedPointHits(editor),
    key = pointKey(hit);
  choosePoints(
    editor,
    selected.some((p) => pointKey(p) === key)
      ? toggle
        ? selected.filter((p) => pointKey(p) !== key)
        : selected
      : [...selected, hit],
    editor.selectedCurves,
  );
}
