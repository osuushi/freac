import { boundaryPoints } from "../sketch/curve-spans.js";
import type { SketchEditor } from "../sketch/editor.js";
import { type Vector, worldPoint } from "../sketch/planes.js";
import { profilesFor } from "../sketch/profiles.js";
import type { LiftSource } from "./body.js";

const ns = "http://www.w3.org/2000/svg";
/** Read-only section outlines and order badges remain visible over the temporary solid. */
export class LoftGuides {
  readonly root = document.createElementNS(ns, "svg");
  constructor() {
    this.root.classList.add("loft-guides");
  }
  update(editor: SketchEditor, sources: LiftSource[]): void {
    this.root.replaceChildren();
    for (const [index, source] of sources.entries()) {
      const loops: Vector[][] = [];
      if ("sketch" in source) {
        const sketch = editor.store.data.sketches.find((s) => s.id === source.sketch);
        const profile = sketch && profilesFor(sketch).find((p) => p.key === source.profile);
        if (sketch && profile)
          for (const loop of [profile.outer, ...profile.holes])
            loops.push(boundaryPoints(loop, 0.05).map((p) => worldPoint(sketch.plane, p)));
      } else {
        const body = editor.store.data.bodies?.find((b) =>
          b.faces.some((f) => f.id === source.face),
        );
        const face = body?.faces.find((f) => f.id === source.face);
        for (const id of face?.edges ?? []) {
          const edge = body?.edges.find((e) => e.id === id);
          if (edge)
            loops.push(
              Array.from(
                { length: edge.points.length / 3 },
                (_, i) => edge.points.slice(i * 3, i * 3 + 3) as Vector,
              ),
            );
        }
      }
      for (const loop of loops) {
        const polyline = document.createElementNS(ns, "polyline");
        polyline.setAttribute(
          "points",
          loop
            .map((p) => {
              const screen = editor.world.project(p);
              return `${screen.x},${screen.y}`;
            })
            .join(" "),
        );
        this.root.append(polyline);
      }
      const first = loops[0]?.[0];
      if (!first) continue;
      const point = editor.world.project(first);
      const circle = document.createElementNS(ns, "circle");
      circle.setAttribute("cx", String(point.x));
      circle.setAttribute("cy", String(point.y));
      circle.setAttribute("r", "10");
      const badge = document.createElementNS(ns, "text");
      badge.textContent = String(index + 1);
      badge.setAttribute("x", String(point.x));
      badge.setAttribute("y", String(point.y + 4));
      this.root.append(circle, badge);
    }
  }
}
