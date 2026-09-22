import * as THREE from "three";
import type { SketchEditor } from "../sketch/editor.js";
import type { Point, Vector } from "../sketch/planes.js";
import { pickFace } from "./body-view.js";
import { featureEdges } from "./feature-edges.js";

export { faceBoundaryEdges } from "./face-boundary.js";

export function pickBodyEdge(editor: SketchEditor, screen: Point) {
  if (!editor.bodiesVisible) return null;
  let best: { body: string; edge: string; distance: number; depth: number; point: Vector } | null =
    null;
  const camera = editor.world.camera.position;
  for (const body of editor.display.bodies ?? []) {
    if (!editor.visibility.visible(body.id)) continue;
    for (const edge of featureEdges(body)) {
      for (let i = 0; i + 3 < edge.points.length; i += 3) {
        const a = new THREE.Vector3().fromArray(edge.points, i);
        const b = new THREE.Vector3().fromArray(edge.points, i + 3);
        const A = editor.world.project(a.toArray() as Vector),
          B = editor.world.project(b.toArray() as Vector);
        const dx = B.x - A.x,
          dy = B.y - A.y;
        const t = Math.max(
          0,
          Math.min(1, ((screen.x - A.x) * dx + (screen.y - A.y) * dy) / (dx * dx + dy * dy || 1)),
        );
        const p = { x: A.x + dx * t, y: A.y + dy * t };
        const distance = Math.hypot(screen.x - p.x, screen.y - p.y);
        if (distance > 7 || (best && distance > best.distance + 0.1)) continue;
        const depth = a.lerp(b, t).distanceTo(camera);
        const covering = pickFace(editor, p);
        if (covering && depth > covering.depth + 0.06) continue;
        if (!best || distance < best.distance - 0.1 || depth < best.depth)
          best = { body: body.id, edge: edge.id, distance, depth, point: a.toArray() as Vector };
      }
    }
  }
  return best;
}
