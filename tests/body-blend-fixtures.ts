import type { DocumentOwner } from "../src/backend/document-owner.js";
import { emptySketch } from "../src/sketch/document.js";
import { planes } from "../src/sketch/planes.js";
import { finish, lift, prism, square, vertical } from "./body-edge-fixtures.js";

export async function roundedFixture(
  owner: DocumentOwner,
  type: "convex" | "concave" | "rim" | "corner",
) {
  const body =
    type === "rim"
      ? await lift(owner, {
          ...emptySketch(planes.XY),
          curves: [
            {
              id: "ring",
              kind: "circle",
              center: { x: 0, y: 0 },
              radius: 8,
              construction: false,
            },
          ],
        })
      : await prism(
          owner,
          type === "concave"
            ? [
                [0, 0],
                [20, 0],
                [20, 10],
                [10, 10],
                [10, 20],
                [0, 20],
              ]
            : square,
        );
  const edges =
    type === "rim"
      ? body.edges.filter((e) => e.curve?.kind === "circle" && e.points[2] > 9)
      : type === "corner"
        ? body.edges.filter(
            (e) =>
              e.curve?.kind === "line" &&
              [e.curve.a, e.curve.b].some((p) => p.every((v) => Math.abs(v) < 1e-7)),
          )
        : [vertical(body, type === "concave" ? 10 : 0, type === "concave" ? 10 : 0)];
  await finish(owner, body, edges, 2);
  await owner.call({ kind: "accept" });
}
