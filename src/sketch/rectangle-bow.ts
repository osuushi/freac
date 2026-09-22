import { constraintCurves } from "./constraint-geometry.js";
import {
  type Arc,
  type Constraint,
  type Segment,
  type Sketch,
  validateSketch,
} from "./document.js";
import type { SketchEditor } from "./editor.js";

export function rectangleBowSide(editor: SketchEditor): Segment | undefined {
  if (editor.selectionOwners.size !== 1 || editor.selectedPoint || !editor.rectangleContext)
    return undefined;
  return editor.sketch?.curves.find(
    (c): c is Segment => c.kind === "segment" && editor.selectionOwners.has(c.id),
  );
}

export function bowRectangleSide(original: Sketch, curve: Segment | Arc) {
  const group = original.groups.find((g) => g.members.includes(curve.id));
  if (!group) throw new Error("Select a rectangle side");
  if (curve.kind === "segment") return { sketch: original, removed: [] as Constraint[] };
  const opposite = group.members[(group.members.indexOf(curve.id) + 2) % 4];
  const constraints: Constraint[] = [],
    removed: Constraint[] = [];
  for (const c of original.constraints) {
    if (!constraintCurves(c).includes(curve.id) || c.kind === "coincident") {
      constraints.push(c);
      continue;
    }
    // Rectangle support directions remain meaningful on the opposite straight side.
    // Length/angle locks on the bowed side are not silently transferred.
    if (c.kind === "parallel" || c.kind === "perpendicular") {
      const candidate = {
        ...c,
        a: c.a === curve.id ? opposite : c.a,
        b: c.b === curve.id ? opposite : c.b,
      };
      if (candidate.a !== candidate.b) {
        constraints.push(candidate);
        continue;
      }
    }
    removed.push(c);
  }
  const sketch: Sketch = {
    ...original,
    curves: original.curves.map((c) => (c.id === curve.id ? curve : c)),
    groups: original.groups.filter((g) => g.id !== group.id),
    constraints,
  };
  validateSketch(sketch);
  return { sketch, removed };
}
