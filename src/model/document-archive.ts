import type { SketchDocument } from "../sketch/document.js";

export function documentArchive(document: SketchDocument): string {
  return JSON.stringify({
    format: "freac",
    version: 1,
    document: {
      ...document,
      bodies: document.bodies?.map(({ id, brep, faces, edges }) => ({
        id,
        brep,
        faces: faces.map(({ id, signature }) => ({ id, signature })),
        edges: edges.map(({ id, signature }) => ({ id, signature })),
      })),
    },
  });
}

export function readArchive(data: string): SketchDocument {
  if (data.startsWith("FREACP1C"))
    throw new Error(
      "This file was saved by the older Freac prototype. This version cannot open that format yet. The file has not been changed.",
    );
  const archive = JSON.parse(data);
  if (archive?.format !== "freac" || archive.version !== 1 || !archive.document)
    throw new Error("Unsupported Freac file format");
  return archive.document;
}
