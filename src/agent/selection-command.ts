import type { SketchEditor } from "../sketch/editor.js";
import { type ModelingTarget, modelingKey } from "../sketch/model-selection.js";
import { targetKey } from "../sketch/selected-targets.js";
import { findInspectionTarget } from "./inspection-geometry.js";

/** Arguments are validated again in the renderer before any UI state changes. */
export function changeAgentSelection(editor: SketchEditor, input: string): void {
  const args: unknown = JSON.parse(input);
  if (!Array.isArray(args) || !args.every((a) => typeof a === "string"))
    throw new Error("Invalid selection arguments.");
  const words = [...args] as string[];
  const mode = words[0] === "--add" || words[0] === "--remove" ? words.shift() : "replace";
  const document = editor.store.data;
  let ids: string[];
  if (words[0] === "--clear" && words.length === 1 && mode === "replace") ids = [];
  else if (
    words[0] === "--surface" &&
    words.length === 2 &&
    ["cylinder", "plane", "other"].includes(words[1])
  ) {
    if (editor.world.active)
      throw new Error("Exit sketch editing before selecting model geometry.");
    ids = (document.bodies ?? []).flatMap((body) =>
      body.faces
        .filter(
          (face) => (face.plane ? "plane" : face.cylinder ? "cylinder" : "other") === words[1],
        )
        .map((face) => face.id),
    );
  } else {
    if (!words.length || words.some((word) => word.startsWith("--")))
      throw new Error(
        "Usage: freac select [--add|--remove] ID... | --surface cylinder|plane|other | --clear",
      );
    ids = words;
  }
  const targets = [...new Set(ids)].map((id) => findInspectionTarget(document, id));
  if (editor.world.active) {
    if (
      targets.some(
        (t) => !(t.kind === "curve" || t.kind === "group") || t.sketch !== editor.sketch?.id,
      )
    )
      throw new Error(
        "Exit sketch editing before selecting model geometry; sketch targets must belong to the active sketch.",
      );
    const selected = targets.filter((t) => t.kind === "curve" || t.kind === "group");
    // Strip inspection-only sketch context from sketch selection targets.
    const wanted = selected.map((t) =>
      t.kind === "curve"
        ? { kind: "curve" as const, curve: t.curve }
        : { kind: "group" as const, group: t.group },
    );
    editor.selectTargets(combine(editor.selected.targets, wanted, mode, targetKey));
  } else {
    if (targets.some((t) => !["face", "edge", "body", "sketch"].includes(t.kind)))
      throw new Error(
        "Enter the sketch before selecting its curves or groups. Supported model targets: faces, edges, bodies and sketches.",
      );
    const wanted = targets as ModelingTarget[];
    editor.modeling.targets = combine(editor.modeling.targets, wanted, mode, modelingKey);
    editor.modeling.hover = null;
    editor.modeling.alternatives = [];
  }
  editor.notice = "";
  editor.refresh();
}

function combine<T>(
  current: readonly T[],
  wanted: T[],
  mode: string | undefined,
  key: (t: T) => string,
): T[] {
  const keys = new Set(wanted.map(key));
  if (mode === "--remove") return current.filter((t) => !keys.has(key(t)));
  if (mode !== "--add") return wanted;
  const existing = new Set(current.map(key));
  return [...current, ...wanted.filter((t) => !existing.has(key(t)))];
}
