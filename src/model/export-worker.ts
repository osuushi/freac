import javascriptWasm from "@jitl/quickjs-wasmfile-release-sync/wasm?url";
import wasmUrl from "manifold-3d/manifold.wasm?url";
import { type EnabledDefinition, JavaScriptDecorators } from "../decorators/javascript-hooks.js";
import { initializeDecoratorRuntime } from "../decorators/javascript-runtime.js";
import { decoratedMeshes, initializeMeshRuntime } from "../decorators/mesh-runtime.js";
import { threadDefinition } from "../decorators/thread-settings.js";
import type { SketchDocument } from "../sketch/document.js";
import { type ExportFormat, encodeMeshes, exportBodies } from "./mesh-export.js";

self.onmessage = async (
  event: MessageEvent<{
    document: SketchDocument;
    format: ExportFormat;
    sources?: EnabledDefinition[];
  }>,
) => {
  try {
    const { document, format } = event.data;
    const javascript = document.decorators?.some((d) => d.definition !== threadDefinition)
      ? new JavaScriptDecorators(
          await initializeDecoratorRuntime(javascriptWasm),
          event.data.sources,
        )
      : undefined;
    const bytes = document.decorators?.length
      ? encodeMeshes(
          decoratedMeshes(await initializeMeshRuntime(wasmUrl), document, javascript),
          format,
        )
      : exportBodies(document.bodies ?? [], format);
    self.postMessage({ bytes }, { transfer: [bytes.buffer] });
  } catch (error) {
    self.postMessage({ error: error instanceof Error ? error.message : String(error) });
  }
};
