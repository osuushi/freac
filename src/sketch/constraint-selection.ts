import { constraintCurves, visibleConstraints } from "./constraint-geometry.js";
import type { Constraint, PointReference } from "./document.js";
import type { SketchEditor } from "./editor.js";
import { selectedPointHits } from "./point-selection.js";

type Selected = { curve: string; end?: PointReference["end"] };
function participants(editor: SketchEditor): Selected[] {
  const points = selectedPointHits(editor).flatMap<Selected>((hit) =>
    hit.kind === "midpoint"
      ? [{ curve: hit.curve }]
      : hit.kind === "handle"
        ? [{ curve: hit.group.members[hit.handle.index] }]
        : hit.kind === "endpoint"
          ? [hit.endpoint]
          : hit.kind === "circleCenter"
            ? [{ curve: hit.curve, end: "center" }]
            : [],
  );
  return [...editor.selectedCurves].map((curve) => ({ curve })).concat(points);
}
function includes(c: Constraint, p: Selected, includeOwner = false): boolean {
  if (!p.end) return constraintCurves(c).includes(p.curve);
  const refs = c.kind === "coincident" ? [c.a, c.b] : c.kind === "point-on-edge" ? [c.point] : [];
  if (!refs.length && includeOwner) return constraintCurves(c).includes(p.curve);
  return refs.some((ref) => ref.curve === p.curve && ref.end === p.end);
}
export function selectedConstraints(editor: SketchEditor) {
  const sketch = editor.sketch,
    selected = participants(editor);
  if (!sketch) return { locks: [] };
  const group = !selectedPointHits(editor).length ? editor.rectangleContext : undefined;
  const one = selected.length === 1 || !!group;
  const pair = selected.length === 2 && !group;
  const locks = visibleConstraints(sketch).filter((c) =>
    one
      ? constraintCurves(c).some((id) => group?.members.includes(id)) ||
        selected.some((p) => includes(c, p, true))
      : pair && selected.every((p) => includes(c, p)) && constraintCurves(c).length === 2,
  );
  return { locks };
}
