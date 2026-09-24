import RELEASE_SYNC from "@jitl/quickjs-wasmfile-release-sync";
import {
  newQuickJSWASMModuleFromVariant,
  newVariant,
  type QuickJSWASMModule,
} from "quickjs-emscripten-core";
import { maxDecoratorSource } from "./definition.js";

const maxJson = 32 * 1024 * 1024;

export function initializeDecoratorRuntime(wasmLocation?: string): Promise<QuickJSWASMModule> {
  const variant = "default" in RELEASE_SYNC ? RELEASE_SYNC.default : RELEASE_SYNC;
  return newQuickJSWASMModuleFromVariant(
    wasmLocation ? newVariant(variant, { wasmLocation }) : variant,
  );
}

/** Fresh isolated VM per hook. Only JSON crosses the boundary; no host functions are installed. */
export function runDecoratorHook(
  module: QuickJSWASMModule,
  source: string,
  hook: string,
  input: unknown,
  milliseconds = 10_000,
): unknown {
  if (source.length > maxDecoratorSource) throw new Error("Decorator source exceeds 256 KiB");
  const serialized = JSON.stringify(input);
  if (!serialized || serialized.length > maxJson)
    throw new Error("Decorator input exceeds its JSON budget");
  const runtime = module.newRuntime();
  runtime.setMemoryLimit(128 * 1024 * 1024);
  runtime.setMaxStackSize(512 * 1024);
  const deadline = Date.now() + milliseconds;
  runtime.setInterruptHandler(() => Date.now() >= deadline);
  runtime.setModuleLoader((name) => {
    if (name !== "decorator")
      throw new Error("Decorator imports are unavailable; bundle a self-contained module");
    return source;
  });
  const context = runtime.newContext();
  try {
    const result = context.evalCode(
      `
      import definition from "decorator";
      const hook = definition[${JSON.stringify(hook)}];
      if (typeof hook !== "function") throw new Error("Missing decorator hook");
      const result = hook(JSON.parse(${JSON.stringify(serialized)}));
      if (result && typeof result.then === "function") throw new Error("Decorator hooks must return synchronously");
      const output = JSON.stringify(result);
      if (typeof output !== "string" || output.length > ${maxJson}) throw new Error("Decorator output exceeds its JSON budget");
      globalThis.__freacOutput = output;
    `,
      "invoke.mjs",
      { type: "module" },
    );
    const value = context.unwrapResult(result);
    value.dispose();
    const output = context.getProp(context.global, "__freacOutput");
    try {
      return JSON.parse(context.getString(output));
    } finally {
      output.dispose();
    }
  } finally {
    context.dispose();
    runtime.dispose();
  }
}
