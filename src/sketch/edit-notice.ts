import type { SketchDocument } from "./document.js";

export function editNotice(before: SketchDocument, after: SketchDocument): string {
  let removed = 0,
    converted = false;
  for (const old of before.sketches) {
    const sketch = after.sketches.find((s) => s.id === old.id);
    if (!sketch) continue;
    removed += old.constraints.filter((c) => !sketch.constraints.some((n) => n.id === c.id)).length;
    converted ||= old.groups.some((g) => !sketch.groups.some((n) => n.id === g.id));
  }
  if (!removed && !converted) return "";
  return `${converted ? "Shape adjusted. " : ""}${removed ? `${removed} constraint${removed === 1 ? "" : "s"} removed. ` : ""}Undo to restore.`;
}
