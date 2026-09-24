import wasmUrl from "manifold-3d/manifold.wasm?url";
import type { SketchDocument } from "../sketch/document.js";
import { decoratorPreview, initializeMeshRuntime } from "./mesh-runtime.js";

const runtime = initializeMeshRuntime(wasmUrl);
self.onmessage = async (event: MessageEvent<SketchDocument>) => {
  try {
    const module = await runtime;
    const meshes = [],
      errors: string[] = [];
    for (const instance of event.data.decorators ?? []) {
      if (instance.problem) continue;
      try {
        meshes.push({
          body: instance.faces[0].body,
          mesh: decoratorPreview(module, event.data, instance),
        });
      } catch (error) {
        errors.push(error instanceof Error ? error.message : String(error));
      }
    }
    self.postMessage({ meshes, error: errors.join("; ") || undefined });
  } catch (error) {
    self.postMessage({ error: error instanceof Error ? error.message : String(error) });
  }
};
