import javascriptWasm from "@jitl/quickjs-wasmfile-release-sync/wasm?url";
import wasmUrl from "manifold-3d/manifold.wasm?url";
import type { SketchDocument } from "../sketch/document.js";
import { type EnabledDefinition, JavaScriptDecorators } from "./javascript-hooks.js";
import { initializeDecoratorRuntime } from "./javascript-runtime.js";
import { decoratorPreview, initializeMeshRuntime } from "./mesh-runtime.js";
import { threadDefinition } from "./thread-settings.js";

const runtime = initializeMeshRuntime(wasmUrl);
let javascriptRuntime: ReturnType<typeof initializeDecoratorRuntime> | undefined;
self.onmessage = async (
  event: MessageEvent<{ document: SketchDocument; sources?: EnabledDefinition[]; live: boolean }>,
) => {
  try {
    const { document, sources, live } = event.data;
    const hasJavaScript = document.decorators?.some((d) => d.definition !== threadDefinition);
    if (hasJavaScript && !javascriptRuntime)
      javascriptRuntime = initializeDecoratorRuntime(javascriptWasm);
    const javascript =
      hasJavaScript && javascriptRuntime
        ? new JavaScriptDecorators(await javascriptRuntime, sources)
        : undefined;
    const module = await runtime;
    const meshes = [],
      errors: string[] = [];
    for (const instance of document.decorators ?? []) {
      if (instance.problem) continue;
      try {
        if (instance.definition !== threadDefinition) {
          const mesh = javascript?.preview(document, instance, live);
          if (mesh) meshes.push({ body: instance.faces[0].body, faces: instance.faces, mesh });
          continue;
        }
        meshes.push({
          body: instance.faces[0].body,
          faces: instance.faces,
          mesh: decoratorPreview(module, document, instance),
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
