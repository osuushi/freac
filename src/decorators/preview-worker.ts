import wasmUrl from "manifold-3d/manifold.wasm?url";
import type { SketchDocument } from "../sketch/document.js";
import { decoratorPreview, initializeMeshRuntime } from "./mesh-runtime.js";

const runtime = initializeMeshRuntime(wasmUrl);
self.onmessage = async (event: MessageEvent<SketchDocument>) => {
  try {
    const module = await runtime;
    const meshes = (event.data.decorators ?? []).map((instance) => ({
      body: instance.faces[0].body,
      mesh: decoratorPreview(module, event.data, instance),
    }));
    self.postMessage({ meshes });
  } catch (error) {
    self.postMessage({ error: error instanceof Error ? error.message : String(error) });
  }
};
