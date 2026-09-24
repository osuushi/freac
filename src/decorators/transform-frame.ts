import { Matrix4, Vector3 } from "three";
import type { ModelRequest } from "../sketch/model-api.js";
import type { PlaneFrame, Vector } from "../sketch/planes.js";
import { cross, dot, subtract, unit } from "./cylinder.js";
import type { DecoratorInstance } from "./types.js";

function rigid(operation: {
  axis: Vector;
  pivot: Vector;
  translation: Vector;
  angle: number;
}): Matrix4 {
  const rotation = new Matrix4().makeRotationAxis(
    new Vector3(...operation.axis).normalize(),
    (operation.angle * Math.PI) / 180,
  );
  return new Matrix4()
    .makeTranslation(...operation.translation)
    .multiply(new Matrix4().makeTranslation(...operation.pivot))
    .multiply(rotation)
    .multiply(new Matrix4().makeTranslation(...(operation.pivot.map((n) => -n) as Vector)));
}

function matrixFor(instance: DecoratorInstance, request?: ModelRequest): Matrix4 | null {
  const body = instance.faces[0].body;
  if (request?.kind === "transform-bodies" && request.transform.ids.includes(body))
    return rigid(request.transform);
  if (request?.kind === "move-faces" || request?.kind === "move-edges") {
    const operation = request.operation;
    const all =
      operation.bodyIds?.includes(body) ||
      (request.kind === "move-faces" &&
        instance.faces.every((f) =>
          request.operation.faces.some((t) => t.face === f.face && t.body === f.body),
        ));
    if (all)
      return rigid({
        ...operation,
        axis: request.kind === "move-faces" ? request.operation.axis : [0, 0, 1],
        pivot: request.kind === "move-faces" ? request.operation.pivot : [0, 0, 0],
        angle: request.kind === "move-faces" ? request.operation.angle : 0,
      });
  }
  if (
    request?.kind === "mirror" &&
    request.operation.kind === "bodies" &&
    request.operation.ids.includes(body)
  ) {
    const { origin, normal } = request.operation.plane;
    const n = unit(normal),
      [x, y, z] = n,
      offset = 2 * dot(origin, n);
    return new Matrix4().set(
      1 - 2 * x * x,
      -2 * x * y,
      -2 * x * z,
      offset * x,
      -2 * y * x,
      1 - 2 * y * y,
      -2 * y * z,
      offset * y,
      -2 * z * x,
      -2 * z * y,
      1 - 2 * z * z,
      offset * z,
      0,
      0,
      0,
      1,
    );
  }
  if (request?.kind === "scale" && request.operation.kind === "solids") {
    const operation = request.operation;
    if (
      operation.ids.includes(body) ||
      instance.faces.every((f) =>
        operation.faces.some((t) => t.face === f.face && t.body === f.body),
      )
    ) {
      const factors = operation.factors ?? [operation.factor, operation.factor, operation.factor];
      return new Matrix4()
        .makeTranslation(...operation.pivot)
        .multiply(new Matrix4().makeScale(...(factors as Vector)))
        .multiply(new Matrix4().makeTranslation(...(operation.pivot.map((n) => -n) as Vector)));
    }
  }
  return null;
}

export function transformedThreadFrame(
  instance: DecoratorInstance,
  request?: ModelRequest,
): PlaneFrame {
  const matrix = matrixFor(instance, request);
  if (!matrix) return instance.frame;
  const point = (p: Vector) => new Vector3(...p).applyMatrix4(matrix).toArray() as Vector;
  const origin = point(instance.frame.origin);
  const direction = (v: Vector) =>
    unit(subtract(point(instance.frame.origin.map((n, i) => n + v[i]) as Vector), origin));
  const axis = direction(cross(instance.frame.u, instance.frame.v));
  const radial = direction(instance.frame.u);
  const u = unit(radial.map((n, i) => n - dot(radial, axis) * axis[i]) as Vector);
  // Rebuild a right-handed frame after reflection; the configured thread hand stays fixed.
  return { origin, u, v: cross(axis, u) };
}

export function transformedAxialReference(
  instance: DecoratorInstance,
  request?: ModelRequest,
): [number, number] | undefined {
  if (!instance.axialReference) return undefined;
  const matrix = matrixFor(instance, request);
  if (!matrix) return instance.axialReference;
  const axis = cross(instance.frame.u, instance.frame.v);
  const origin = new Vector3(...instance.frame.origin).applyMatrix4(matrix);
  const endpoint = new Vector3(...instance.frame.origin.map((n, i) => n + axis[i])).applyMatrix4(
    matrix,
  );
  const factor = endpoint.distanceTo(origin);
  return instance.axialReference.map((z) => z * factor) as [number, number];
}
