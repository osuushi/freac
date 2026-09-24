import wasmUrl from "manifold-3d/manifold.wasm?url";
import { decoratedMeshes, initializeMeshRuntime } from "../decorators/mesh-runtime.js";
import type { SketchDocument } from "../sketch/document.js";
import { type ExportFormat, encodeMeshes, exportBodies } from "./mesh-export.js";

self.onmessage = async (
  event: MessageEvent<{ document: SketchDocument; format: ExportFormat }>,
) => {
  try {
    const { document, format } = event.data;
    const bytes = document.decorators?.length
      ? encodeMeshes(decoratedMeshes(await initializeMeshRuntime(wasmUrl), document), format)
      : exportBodies(document.bodies ?? [], format);
    self.postMessage({ bytes }, { transfer: [bytes.buffer] });
  } catch (error) {
    self.postMessage({ error: error instanceof Error ? error.message : String(error) });
  }
};
