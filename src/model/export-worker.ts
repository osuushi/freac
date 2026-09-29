import javascriptWasm from "@jitl/quickjs-wasmfile-release-sync/wasm?url";
import wasmUrl from "manifold-3d/manifold.wasm?url";
import { isBuiltinDecorator } from "../decorators/builtins.js";
import { type EnabledDefinition, JavaScriptDecorators } from "../decorators/javascript-hooks.js";
import { initializeDecoratorRuntime } from "../decorators/javascript-runtime.js";
import { decoratedMeshes, initializeMeshRuntime } from "../decorators/mesh-runtime.js";
import { nativeDecoratedMeshes } from "../decorators/native-export.js";
import type { SketchDocument } from "../sketch/document.js";
import { ExportTiming } from "./export-timing.js";
import { type ExportFormat, encodeMeshes, exportBodies } from "./mesh-export.js";

let pending: { resolve: (output: ArrayBuffer) => void; reject: (error: Error) => void } | undefined;
function integrate(input: ArrayBuffer): Promise<ArrayBuffer> {
  return new Promise((resolve, reject) => {
    pending = { resolve, reject };
    self.postMessage({ nativeMesh: input }, { transfer: [input] });
  });
}

self.onmessage = async (
  event: MessageEvent<{
    document: SketchDocument;
    format: ExportFormat;
    sources?: EnabledDefinition[];
    native?: boolean;
    profile?: boolean;
    nativeResult?: ArrayBuffer;
    nativeError?: string;
  }>,
) => {
  if (event.data.nativeResult || event.data.nativeError) {
    const reply = pending;
    pending = undefined;
    if (event.data.nativeResult) reply?.resolve(event.data.nativeResult);
    else reply?.reject(new Error(event.data.nativeError));
    return;
  }
  try {
    const timing = event.data.profile ? new ExportTiming() : undefined;
    const { document, format } = event.data;
    const javascript = document.decorators?.some((d) => !isBuiltinDecorator(d.definition))
      ? new JavaScriptDecorators(
          await initializeDecoratorRuntime(javascriptWasm),
          event.data.sources,
        )
      : undefined;
    timing?.mark("runtimeSetup");
    const bytes = document.decorators?.length
      ? encodeMeshes(
          event.data.native
            ? await nativeDecoratedMeshes(document, integrate, javascript, timing)
            : decoratedMeshes(await initializeMeshRuntime(wasmUrl), document, javascript),
          format,
          timing,
        )
      : exportBodies(document.bodies ?? [], format);
    timing?.mark("finish");
    self.postMessage({ bytes, timings: timing?.milliseconds }, { transfer: [bytes.buffer] });
  } catch (error) {
    self.postMessage({ error: error instanceof Error ? error.message : String(error) });
  }
};
