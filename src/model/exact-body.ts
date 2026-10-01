/** Exact geometry and ordered topology identity, without display derivatives. */
export interface ExactBody {
  readonly id: string;
  readonly brep: string;
  readonly faces: readonly { readonly id: string; readonly signature: readonly number[] }[];
  readonly edges: readonly { readonly id: string; readonly signature: readonly number[] }[];
}

export function exactBodies(bodies: readonly ExactBody[]): ExactBody[] {
  return bodies.map(({ id, brep, faces, edges }) => ({
    id,
    brep,
    faces: faces.map(({ id, signature }) => ({ id, signature })),
    edges: edges.map(({ id, signature }) => ({ id, signature })),
  }));
}
