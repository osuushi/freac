import type { Body, BooleanMode, Edge, Face } from "../model/body.js";
import { topologyOrigins } from "../model/body-correspondence.js";
import { newId } from "../sketch/document.js";

type Descendant<T> = Omit<T, "id"> & { predecessors: string[] };
export interface KernelResult<Mode extends BooleanMode | "inspect" = BooleanMode> {
  mode: Mode;
  participants: string[];
  results: (Omit<Body, "id" | "faces" | "edges"> & {
    copy?: boolean;
    predecessorBodies: string[];
    faces: (Descendant<Omit<Face, "edges" | "blend" | "offsetFaces" | "thickness">> & {
      thickness?: { faceIndex: number; distance: number; slope: 1 | -1 } | null;
      edgeIndexes: number[];
      offsetFaceIndexes?: number[];
      offsetSelected?: boolean;
      blend?: { radius: number; outward: 1 | -1; faceIndexes: number[] } | null;
    })[];
    edges: Descendant<Edge>[];
  })[];
}
/** Preserve IDs only for one-to-one continuations. A split/merge gets new identities. */
export function materialize(
  previous: readonly Body[],
  result: KernelResult<BooleanMode | "inspect">,
): Body[] {
  const retained = new Set(
    previous
      .filter((body) => !result.participants.includes(body.id))
      .flatMap((body) => [body.id, ...body.faces.map((f) => f.id), ...body.edges.map((e) => e.id)]),
  );
  const counts = new Map<string, number>();
  for (const body of result.results) {
    for (const ids of [
      body.predecessorBodies,
      ...body.faces.map((f) => f.predecessors),
      ...body.edges.map((e) => e.predecessors),
    ])
      for (const id of ids) counts.set(id, (counts.get(id) ?? 0) + 1);
  }
  const identity = (ids: string[]) =>
    ids.length === 1 && counts.get(ids[0]) === 1 && !retained.has(ids[0]) ? ids[0] : newId();
  const bodies = result.results.map(
    ({ predecessorBodies, faces, edges, copy = false, ...body }) => {
      const identify = (ids: string[]) => (copy ? newId() : identity(ids));
      const mappedEdges = edges.map(({ predecessors, ...edge }) => ({
        ...edge,
        id: identify(predecessors),
      }));
      const faceIds = faces.map(({ predecessors }) => identify(predecessors));
      for (const { thickness } of faces)
        if (thickness && (!Number.isInteger(thickness.faceIndex) || !faceIds[thickness.faceIndex]))
          throw new Error("Kernel thickness references an invalid face");
      const materialized: Body = {
        ...body,
        id: identify(predecessorBodies),
        faces: faces.map(
          (
            {
              predecessors: _predecessors,
              edgeIndexes,
              offsetFaceIndexes,
              offsetSelected: _offsetSelected,
              blend,
              thickness,
              ...face
            },
            index,
          ) => ({
            ...face,
            id: faceIds[index],
            thickness: thickness
              ? {
                  face: faceIds[thickness.faceIndex],
                  distance: thickness.distance,
                  slope: thickness.slope,
                }
              : null,
            offsetFaces: offsetFaceIndexes?.map((i) => {
              if (!Number.isInteger(i) || !faceIds[i])
                throw new Error("Kernel offset references an invalid face");
              return faceIds[i];
            }),
            blend: blend
              ? {
                  radius: blend.radius,
                  outward: blend.outward,
                  faces: blend.faceIndexes.map((i) => {
                    if (!Number.isInteger(i) || !faceIds[i])
                      throw new Error("Kernel blend references an invalid face");
                    return faceIds[i];
                  }),
                }
              : null,
            edges: edgeIndexes.map((index) => {
              if (!Number.isInteger(index) || !mappedEdges[index])
                throw new Error("Kernel face references an invalid edge");
              return mappedEdges[index].id;
            }),
          }),
        ),
        edges: mappedEdges,
      };
      topologyOrigins.set(materialized, {
        bodies: predecessorBodies,
        copy,
        faces: new Map(faces.map((face, index) => [faceIds[index], face.predecessors])),
      });
      return materialized;
    },
  );
  return [...previous.filter((body) => !result.participants.includes(body.id)), ...bodies];
}

/** Transforms and fillets continue each body in place, including entity-list order. */
export function continuingBodies(previous: readonly Body[], next: Body[]): Body[] {
  if (previous.length !== next.length) throw new Error("Operation changed the body count");
  return previous.map((body) => {
    const continued = next.find((candidate) => candidate.id === body.id);
    if (!continued) throw new Error("Operation lost body identity");
    return continued;
  });
}
