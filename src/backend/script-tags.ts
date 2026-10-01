import type { ScriptOperation } from "../agent-script/api.js";
import type { SketchDocument } from "../sketch/document.js";
import { requireTag } from "../tags/model.js";
import type { TaggedOperation } from "../tags/script.js";

export function resolveTagOperation(
  document: SketchDocument,
  input: { id: string; operation: TaggedOperation },
): Extract<
  ScriptOperation,
  { kind: "offsetFaces" | "moveFaces" | "finishEdges" | "shell" | "scale" }
> {
  const group = requireTag(document, input.id),
    operation = input.operation;
  if (!group.members.length)
    throw new Error("Tagged group has no remaining geometry; repair its membership first");
  if (
    !operation ||
    !["offsetFaces", "moveFaces", "finishEdges", "shell", "scale"].includes(operation.kind)
  )
    throw new Error("Unsupported tagged group operation");
  const faces = group.members
    .filter((m) => m.kind === "face")
    .map((m) => ({ body: group.body, face: m.id }));
  const edges = group.members
    .filter((m) => m.kind === "edge")
    .map((m) => ({ body: group.body, edge: m.id }));
  if (
    operation.kind !== "scale" &&
    (operation.kind === "finishEdges" ? faces.length : edges.length)
  )
    throw new Error("Tagged group contains members incompatible with this operation");
  switch (operation.kind) {
    case "offsetFaces":
      return { kind: operation.kind, input: { faces, distance: operation.distance } };
    case "moveFaces":
      return {
        kind: operation.kind,
        input: {
          faces,
          translation: operation.translation,
          pivot: operation.pivot,
          axis: operation.axis,
          angle: operation.angle,
        },
      };
    case "finishEdges":
      return { kind: operation.kind, input: { edges, size: operation.size, mode: operation.mode } };
    case "shell":
      return {
        kind: operation.kind,
        input: {
          selection: [{ body: group.body, faces: faces.map((f) => f.face) }],
          thickness: operation.thickness,
        },
      };
    case "scale":
      return {
        kind: operation.kind,
        input: {
          kind: "solids",
          ids: [],
          faces,
          edges,
          factor: operation.factor,
          pivot: operation.pivot,
        },
      };
  }
}
