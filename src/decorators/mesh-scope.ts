import type { Manifold, ManifoldToplevel } from "manifold-3d";
import { type ExportMesh, validateMesh } from "../model/export-mesh.js";
import { packedMesh } from "../model/packed-mesh.js";
import type { Vector } from "../sketch/planes.js";

/** Own temporary native meshes and keep float mesh coordinates near the body origin. */
export class MeshScope {
  private handles: Manifold[] = [];
  constructor(
    readonly runtime: ManifoldToplevel,
    readonly origin: Vector = [0, 0, 0],
    private maxRounding = Infinity,
  ) {}
  keep(solid: Manifold): Manifold {
    this.handles.push(solid);
    return solid;
  }
  from(mesh: ExportMesh): Manifold {
    validateMesh(mesh);
    return this.keep(
      new this.runtime.Manifold(
        new this.runtime.Mesh({
          numProp: 3,
          vertProperties: new Float32Array(
            mesh.vertices.flatMap((point) => point.map((v, i) => v - this.origin[i])),
          ),
          triVerts: new Uint32Array(mesh.triangles.flat()),
        }),
      ),
    );
  }
  mesh(solid: Manifold): ExportMesh {
    const status = solid.status();
    if (status !== "NoError") throw new Error(`Mesh generation failed: ${status}`);
    const rounding = solid.tolerance();
    if (rounding > this.maxRounding)
      throw new Error("This body's extent exceeds the thread mesh precision budget");
    const result = solid.getMesh();
    const mesh: ExportMesh = { vertices: [], triangles: [] };
    for (let i = 0; i < result.vertProperties.length; i += result.numProp)
      mesh.vertices.push(
        Array.from(result.vertProperties.slice(i, i + 3), (v, axis) => v + this.origin[axis]),
      );
    for (let i = 0; i < result.triVerts.length; i += 3)
      mesh.triangles.push(Array.from(result.triVerts.slice(i, i + 3)));
    const packed = packedMesh(mesh, rounding);
    validateMesh(packed);
    return Number.isFinite(this.maxRounding) ? { ...packed, precision: this.maxRounding } : packed;
  }
  close(): void {
    for (const handle of this.handles.reverse()) handle.delete();
  }
}
