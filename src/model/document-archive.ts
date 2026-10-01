import type { SketchDocument } from "../sketch/document.js";
import { type CameraState, validateCameraState } from "./camera-state.js";
import { exactBodies } from "./exact-body.js";

export function documentArchive(document: SketchDocument, camera?: CameraState): string {
  return JSON.stringify({
    format: "freac",
    version: 1,
    ...(camera ? { camera: validateCameraState(camera) } : {}),
    document: {
      ...document,
      bodies: document.bodies && exactBodies(document.bodies),
    },
  });
}

export function readArchive(data: string): SketchDocument {
  return readFileArchive(data).document;
}

export function readFileArchive(data: string): { document: SketchDocument; camera?: CameraState } {
  if (data.startsWith("FREACP1C"))
    throw new Error(
      "This file was saved by the older Freac prototype. This version cannot open that format yet. The file has not been changed.",
    );
  const archive = JSON.parse(data);
  if (archive?.format !== "freac" || archive.version !== 1 || !archive.document)
    throw new Error("Unsupported Freac file format");
  const camera = validateCameraState(archive.camera);
  return { document: archive.document, ...(camera ? { camera } : {}) };
}
