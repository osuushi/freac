import * as THREE from "three";
import type { Vector } from "../sketch/planes.js";
import type { Body, BodyTransform } from "./body.js";

export const axes: Record<string, Vector> = { X: [1, 0, 0], Y: [0, 1, 0], Z: [0, 0, 1] };
export function bodyCenter(bodies: readonly Body[]): Vector {
  const box = new THREE.Box3();
  for (const body of bodies) {
    box.expandByPoint(new THREE.Vector3(...body.bounds.slice(0, 3)));
    box.expandByPoint(new THREE.Vector3(...body.bounds.slice(3, 6)));
  }
  return box.getCenter(new THREE.Vector3()).toArray() as Vector;
}
export function placementMatrix(edit: BodyTransform): THREE.Matrix4 {
  return new THREE.Matrix4()
    .makeTranslation(...edit.translation)
    .multiply(new THREE.Matrix4().makeTranslation(...edit.pivot))
    .multiply(
      new THREE.Matrix4().makeRotationAxis(
        new THREE.Vector3(...edit.axis),
        (edit.angle * Math.PI) / 180,
      ),
    )
    .multiply(new THREE.Matrix4().makeTranslation(...(edit.pivot.map((v) => -v) as Vector)));
}
/** Temporary display only. Exact BReps and topology are transformed by the kernel on acceptance. */
export function placedBodies(bodies: readonly Body[], edit: BodyTransform): Body[] {
  const matrix = placementMatrix(edit);
  const point = (p: Vector): Vector =>
    new THREE.Vector3(...p).applyMatrix4(matrix).toArray() as Vector;
  const direction = (p: Vector): Vector =>
    new THREE.Vector3(...p).transformDirection(matrix).toArray() as Vector;
  const points = (values: number[]) =>
    values.flatMap((_, i) => (i % 3 ? [] : point(values.slice(i, i + 3) as Vector)));
  return bodies.map((body) => {
    const faces = body.faces.map((face) => ({
      ...face,
      vertices: points(face.vertices),
      plane: face.plane
        ? {
            origin: point(face.plane.origin),
            u: direction(face.plane.u),
            v: direction(face.plane.v),
          }
        : null,
    }));
    const box = new THREE.Box3().setFromPoints(
      faces.flatMap((f) =>
        f.vertices.flatMap((_, i) => (i % 3 ? [] : [new THREE.Vector3().fromArray(f.vertices, i)])),
      ),
    );
    return {
      ...body,
      id: edit.duplicate ? `copy-preview/${body.id}` : body.id,
      center: point(body.center),
      bounds: [...box.min.toArray(), ...box.max.toArray()],
      faces,
      edges: body.edges.map((edge) => ({
        ...edge,
        points: points(edge.points),
        curve: !edge.curve
          ? null
          : edge.curve.kind === "circle"
            ? {
                ...edge.curve,
                center: point(edge.curve.center),
                normal: direction(edge.curve.normal),
              }
            : edge.curve.kind === "arc"
              ? {
                  ...edge.curve,
                  a: point(edge.curve.a),
                  b: point(edge.curve.b),
                  mid: point(edge.curve.mid),
                }
              : { ...edge.curve, a: point(edge.curve.a), b: point(edge.curve.b) },
      })),
    };
  });
}
