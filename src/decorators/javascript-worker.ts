import wasmUrl from "@jitl/quickjs-wasmfile-release-sync/wasm?url";
import { initializeDecoratorRuntime, runDecoratorHook } from "./javascript-runtime.js";

const runtime = initializeDecoratorRuntime(wasmUrl);
self.onmessage = async (event: MessageEvent<{ source: string; hook: string; input: unknown }>) => {
  try {
    const { source, hook, input } = event.data;
    self.postMessage({ result: runDecoratorHook(await runtime, source, hook, input) });
  } catch (error) {
    self.postMessage({ error: error instanceof Error ? error.message : String(error) });
  }
};
