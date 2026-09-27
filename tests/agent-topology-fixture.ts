import type { SketchResult } from "../src/agent-script/api.js";
import type { DocumentOwner } from "../src/backend/document-owner.js";

export async function cylinder(
  owner: DocumentOwner,
  radius: number,
  z: number,
  height: number,
  mode: "new" | "union" | "subtract" = "new",
  targets: string[] = [],
) {
  const s = (await owner.scripts.step({
    kind: "createSketch",
    input: {
      plane: { origin: [0, 0, z], u: [1, 0, 0], v: [0, 1, 0] },
      curves: [{ kind: "circle", center: { x: 0, y: 0 }, radius }],
    },
  })) as SketchResult;
  await owner.scripts.step({
    kind: "extrude",
    input: {
      sources: s.profiles,
      distance: height,
      mode,
      targets,
    },
  });
}
