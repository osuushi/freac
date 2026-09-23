import type { SketchEditor } from "../sketch/editor.js";
import type { Point, Vector } from "../sketch/planes.js";
import type { Body } from "./body.js";
import { shadowPlanes } from "./movement-shadow-geometry.js";

/** Keep only surfaces a view ray encounters before reaching the axis=0 receiver. */
export function clipShadowOccluder(triangle: Vector[], axis: number, direction: number): Vector[] {
  if (Math.abs(direction) < 1e-8) return [];
  const result: Vector[] = [];
  for (let i = 0; i < triangle.length; i++) {
    const a = triangle[i],
      b = triangle[(i + 1) % triangle.length];
    const insideA = a[axis] * direction <= 0,
      insideB = b[axis] * direction <= 0;
    if (insideA) result.push(a);
    if (insideA !== insideB) {
      const t = -a[axis] / (b[axis] - a[axis]);
      result.push(a.map((value, j) => value + (b[j] - value) * t) as Vector);
    }
  }
  return result;
}

export function shadowOcclusionPaths(
  bodies: readonly Body[],
  direction: Vector,
  project: (p: Vector) => Point,
): string[] {
  return shadowPlanes.map(({ normal }) => {
    const paths: string[] = [];
    for (const body of bodies)
      for (const face of body.faces) {
        for (let i = 0; i < face.vertices.length; i += 9) {
          const triangle = [0, 3, 6].map((j) => face.vertices.slice(i + j, i + j + 3) as Vector);
          const polygon = clipShadowOccluder(triangle, normal, direction[normal]).map(project);
          if (polygon.length < 3) continue;
          const area = polygon.reduce((sum, p, index) => {
            const q = polygon[(index + 1) % polygon.length];
            return sum + p.x * q.y - q.x * p.y;
          }, 0);
          if (Math.abs(area) < 1e-8) continue;
          if (area < 0) polygon.reverse();
          paths.push(
            polygon.map((p, j) => `${j ? "L" : "M"}${p.x.toFixed(3)},${p.y.toFixed(3)}`).join(" ") +
              "Z",
          );
        }
      }
    return paths.join(" ");
  });
}

/** Cache only display derivatives; preview bodies, visibility and camera invalidate them. */
export class ShadowOcclusion {
  private bodies: readonly Body[] | undefined;
  private accepted: readonly Body[] | undefined;
  private key = "";
  private paths = ["", "", ""];
  update(editor: SketchEditor): string[] {
    const world = editor.world,
      camera = world.camera;
    const bounds = world.canvas.getBoundingClientRect();
    const key = `${editor.visibility.key}:${editor.bodiesVisible}:${bounds.width}:${bounds.height}:${camera.matrixWorld.elements}:${camera.projectionMatrix.elements}`;
    if (
      this.bodies === editor.display.bodies &&
      this.accepted === editor.store.data.bodies &&
      key === this.key
    )
      return this.paths;
    this.bodies = editor.display.bodies;
    this.accepted = editor.store.data.bodies;
    this.key = key;
    const visible = (this.bodies ?? []).filter(
      (body) =>
        editor.visibility.visible(body.id) &&
        (editor.bodiesVisible || !this.accepted?.some((accepted) => accepted.id === body.id)),
    );
    // Orthographic view rays share the camera's negative local Z direction.
    const m = camera.matrixWorld.elements;
    this.paths = shadowOcclusionPaths(visible, [-m[8], -m[9], -m[10]], (point) => {
      const p = world.project(point);
      return { x: p.x - bounds.left, y: p.y - bounds.top };
    });
    return this.paths;
  }
}
