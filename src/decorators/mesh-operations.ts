import type { Mat4 } from "manifold-3d";
import type { ExportMesh } from "../model/export-mesh.js";
import type { Vector } from "../sketch/planes.js";

/** The mesh operations used to clip decorators and integrate an export body. */
export interface MeshSolid<S> {
  add(other: S): S;
  subtract(other: S): S;
  intersect(other: S): S;
  trimByPlane(normal: Vector, offset: number): S;
  transform(matrix: Mat4): S;
  boundingBox(): { min: Vector; max: Vector };
}
export interface MeshOperations<S extends MeshSolid<S>> {
  readonly origin: Vector;
  from(mesh: ExportMesh): S;
  keep(solid: S): S;
  cylinder(height: number, radius: number, segments: number): S;
}
