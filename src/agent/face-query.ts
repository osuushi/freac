import type { Face } from "../model/body.js";
import type { SketchDocument } from "../sketch/document.js";
import type { InspectionView } from "./inspection-protocol.js";

interface FaceBase {
  kind: "face";
  id: string;
  body: string;
  edges: readonly string[];
  visible: boolean;
}
/** Exact analytic support metadata; support surfaces do not describe trimmed extents. */
export type FaceInfo = FaceBase &
  (
    | { surface: "plane"; plane: NonNullable<Face["plane"]>; cylinder: null }
    | { surface: "cylinder"; plane: null; cylinder: NonNullable<Face["cylinder"]> }
    | { surface: "other"; plane: null; cylinder: null }
  );

export function queryFaces(
  document: SketchDocument,
  view: Pick<InspectionView, "bodiesVisible" | "hidden">,
): FaceInfo[] {
  return (document.bodies ?? []).flatMap((body) =>
    body.faces.map((face): FaceInfo => {
      const base: FaceBase = {
        kind: "face",
        id: face.id,
        body: body.id,
        edges: face.edges,
        visible: view.bodiesVisible && !view.hidden.includes(body.id),
      };
      if (face.plane) return { ...base, surface: "plane", plane: face.plane, cylinder: null };
      if (face.cylinder)
        return { ...base, surface: "cylinder", plane: null, cylinder: face.cylinder };
      return { ...base, surface: "other", plane: null, cylinder: null };
    }),
  );
}
