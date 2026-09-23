import type { Body, BodyEdgeFinish, BooleanMode, Edge, Face } from "../model/body.js";
import { type Curve, newId } from "../sketch/document.js";

type Descendant<T> = Omit<T, "id"> & { predecessors: string[] };
export interface KernelResult {
  sections?: import("../model/sketch-section.js").SketchSection[];
  measurement?: import("../model/measurement.js").Measurement;
  curves?: Curve[];
  edgeSelection?: BodyEdgeFinish["edges"];
  mode: BooleanMode;
  participants: string[];
  results: (Omit<Body, "id" | "faces" | "edges"> & {
    predecessorBodies: string[];
    faces: (Descendant<Omit<Face, "edges" | "blend" | "offsetFaces">> & {
      edgeIndexes: number[];
      offsetFaceIndexes?: number[];
      offsetSelected?: boolean;
      blend?: { radius: number; outward: 1 | -1; faceIndexes: number[] } | null;
    })[];
    edges: Descendant<Edge>[];
  })[];
}
/** Preserve IDs only for one-to-one continuations. A split/merge gets new identities. */
export function materialize(previous: readonly Body[], result: KernelResult): Body[] {
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
    ids.length === 1 && counts.get(ids[0]) === 1 ? ids[0] : newId();
  const bodies = result.results.map(({ predecessorBodies, faces, edges, ...body }) => {
    const mappedEdges = edges.map(({ predecessors, ...edge }) => ({
      ...edge,
      id: identity(predecessors),
    }));
    const faceIds = faces.map(({ predecessors }) => identity(predecessors));
    return {
      ...body,
      id: identity(predecessorBodies),
      faces: faces.map(
        (
          {
            predecessors: _predecessors,
            edgeIndexes,
            offsetFaceIndexes,
            offsetSelected: _offsetSelected,
            blend,
            ...face
          },
          index,
        ) => ({
          ...face,
          id: faceIds[index],
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
  });
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
