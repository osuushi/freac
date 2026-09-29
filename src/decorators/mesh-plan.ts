import type { Mat4 } from "manifold-3d";
import { type ExportMesh, validateMesh } from "../model/export-mesh.js";
import type { Vector } from "../sketch/planes.js";
import type { MeshOperations, MeshSolid } from "./mesh-operations.js";

type Bounds = { min: Vector; max: Vector };
export type MeshNode =
  | { kind: "mesh"; mesh: ExportMesh }
  | { kind: "add" | "subtract" | "intersect"; a: number; b: number }
  | { kind: "trim"; a: number; normal: Vector; offset: number }
  | { kind: "cylinder"; height: number; radius: number; segments: number }
  | { kind: "transform"; a: number; matrix: Mat4 };

function bounds(points: number[][]): Bounds {
  const min: Vector = [Infinity, Infinity, Infinity],
    max: Vector = [-Infinity, -Infinity, -Infinity];
  for (const point of points)
    for (let i = 0; i < 3; i++) {
      min[i] = Math.min(min[i], point[i]);
      max[i] = Math.max(max[i], point[i]);
    }
  return { min, max };
}

class PlannedSolid implements MeshSolid<PlannedSolid> {
  constructor(
    private plan: MeshPlan,
    readonly index: number,
    private box: Bounds,
  ) {}
  private boolean(kind: "add" | "subtract" | "intersect", other: PlannedSolid) {
    if (this.plan !== other.plan) throw new Error("Export operands belong to different bodies");
    return this.plan.append(
      { kind, a: this.index, b: other.index },
      kind === "add"
        ? bounds([this.box.min, this.box.max, other.box.min, other.box.max])
        : this.box,
    );
  }
  add(other: PlannedSolid) {
    return this.boolean("add", other);
  }
  subtract(other: PlannedSolid) {
    return this.boolean("subtract", other);
  }
  intersect(other: PlannedSolid) {
    return this.boolean("intersect", other);
  }
  trimByPlane(normal: Vector, offset: number) {
    return this.plan.append({ kind: "trim", a: this.index, normal, offset }, this.box);
  }
  transform(matrix: Mat4) {
    const points: number[][] = [];
    for (const x of [this.box.min[0], this.box.max[0]])
      for (const y of [this.box.min[1], this.box.max[1]])
        for (const z of [this.box.min[2], this.box.max[2]])
          points.push(
            [0, 1, 2].map(
              (i) => matrix[i] * x + matrix[4 + i] * y + matrix[8 + i] * z + matrix[12 + i],
            ),
          );
    return this.plan.append({ kind: "transform", a: this.index, matrix }, bounds(points));
  }
  // Conservative bounds suffice to extend cylindrical trimming tools beyond their target.
  // No Boolean evaluation is needed just to construct those tools.
  boundingBox() {
    return this.box;
  }
}

/** Temporary export instructions, never accepted geometry or saved document state. */
export class MeshPlan implements MeshOperations<PlannedSolid> {
  readonly nodes: MeshNode[] = [];
  constructor(readonly origin: Vector) {}
  append(node: MeshNode, box: Bounds): PlannedSolid {
    return new PlannedSolid(this, this.nodes.push(node) - 1, box);
  }
  keep(solid: PlannedSolid) {
    return solid;
  }
  from(mesh: ExportMesh): PlannedSolid {
    validateMesh(mesh);
    const box = bounds(mesh.vertices);
    for (let i = 0; i < 3; i++) {
      box.min[i] = Math.fround(box.min[i] - this.origin[i]);
      box.max[i] = Math.fround(box.max[i] - this.origin[i]);
    }
    return this.append({ kind: "mesh", mesh }, box);
  }
  cylinder(height: number, radius: number, segments: number): PlannedSolid {
    return this.append(
      { kind: "cylinder", height, radius, segments },
      {
        min: [-radius, -radius, 0],
        max: [radius, radius, height],
      },
    );
  }
}
