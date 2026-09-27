import javascriptWasm from "@jitl/quickjs-wasmfile-release-sync/wasm?url";
import wasmUrl from "manifold-3d/manifold.wasm?url";
import type { QuickJSWASMModule } from "quickjs-emscripten-core";
import type { SketchDocument } from "../sketch/document.js";
import { isBuiltinDecorator } from "./builtins.js";
import type { EnabledDefinition } from "./javascript-hooks.js";
import {
  decoratorLivePreview,
  decoratorPreview,
  initializeMeshRuntime,
  PreviewRuntimeRequired,
} from "./mesh-runtime.js";
import { PreviewHistories } from "./preview-feedback.js";
import { packPreviewMesh } from "./preview-wire.js";

const histories = new PreviewHistories();
type RenderState = { signature?: string; live: boolean };
const rendered = new Map<string, RenderState>();
let runtime: ReturnType<typeof initializeMeshRuntime> | undefined;
let javascriptRuntime: Promise<QuickJSWASMModule> | undefined;

function nextRenderState(id: string, signature: string | undefined, live: boolean): RenderState {
  const previous = rendered.get(id);
  return {
    signature,
    live: live && (previous?.live === true || previous?.signature !== signature),
  };
}

function needsRender(id: string, next: RenderState): boolean {
  const previous = rendered.get(id);
  return previous?.signature !== next.signature || previous?.live !== next.live;
}

async function javascriptDecorators(sources?: EnabledDefinition[]) {
  const [{ JavaScriptDecorators }, { initializeDecoratorRuntime }] = await Promise.all([
    import("./javascript-hooks.js"),
    import("./javascript-runtime.js"),
  ]);
  if (!javascriptRuntime) javascriptRuntime = initializeDecoratorRuntime(javascriptWasm);
  return new JavaScriptDecorators(await javascriptRuntime, sources);
}

function liveGroupCount(document: SketchDocument, sources?: EnabledDefinition[]): number {
  return (document.decorators ?? []).filter((instance) => {
    if (instance.problem) return false;
    if (isBuiltinDecorator(instance.definition)) return true;
    const definition = document.decoratorDefinitions?.find(
      (entry) => entry.id === instance.definition && entry.version === instance.version,
    );
    return (
      !!definition?.preview &&
      !!definition.livePreview &&
      !!sources?.some(
        (source) =>
          source.id === definition.id &&
          source.version === definition.version &&
          source.source === definition.source,
      )
    );
  }).length;
}

self.onmessage = async (
  event: MessageEvent<{
    document: SketchDocument;
    sources?: EnabledDefinition[];
    live: boolean;
    signatures: [string, string][];
  }>,
) => {
  try {
    const messageStarted = performance.now();
    const { document, sources, live } = event.data;
    const signatures = new Map(event.data.signatures);
    const hasJavaScript = document.decorators?.some(
      (instance) =>
        !isBuiltinDecorator(instance.definition) &&
        needsRender(instance.id, nextRenderState(instance.id, signatures.get(instance.id), live)),
    );
    const javascript = hasJavaScript ? await javascriptDecorators(sources) : undefined;
    const meshes = [],
      processedIds: string[] = [],
      errors: string[] = [];
    histories.retain(new Set(document.decorators?.map((instance) => instance.id)));
    for (const id of rendered.keys()) if (!signatures.has(id)) rendered.delete(id);
    const targetMs = Math.max(16, 100 / Math.max(1, liveGroupCount(document, sources)));
    for (const instance of document.decorators ?? []) {
      if (instance.problem) continue;
      const next = nextRenderState(instance.id, signatures.get(instance.id), live);
      if (!needsRender(instance.id, next)) continue;
      processedIds.push(instance.id);
      try {
        const signature = JSON.stringify([
          instance.definition,
          instance.version,
          instance.faces,
          instance.settings,
        ]);
        const feedback = histories.feedback(instance.id, signature, targetMs);
        const started = performance.now();
        if (!isBuiltinDecorator(instance.definition)) {
          const result = javascript?.preview(document, instance, next.live, feedback);
          if (!result) {
            rendered.set(instance.id, next);
            continue;
          }
          if (next.live)
            histories.record(instance.id, signature, performance.now() - started, result.state);
          if (result.mesh)
            meshes.push({
              id: instance.id,
              body: instance.faces[0].body,
              faces: instance.faces,
              ...packPreviewMesh(result.mesh),
            });
          rendered.set(instance.id, next);
          continue;
        }
        const preview = (module?: Awaited<ReturnType<typeof initializeMeshRuntime>>) =>
          next.live
            ? decoratorLivePreview(module, document, instance, feedback)
            : { mesh: decoratorPreview(module, document, instance), state: null };
        let result: ReturnType<typeof preview>;
        try {
          result = preview();
        } catch (error) {
          if (!(error instanceof PreviewRuntimeRequired)) throw error;
          if (!runtime) runtime = initializeMeshRuntime(wasmUrl);
          result = preview(await runtime);
        }
        if (next.live)
          histories.record(instance.id, signature, performance.now() - started, result.state);
        meshes.push({
          id: instance.id,
          body: instance.faces[0].body,
          faces: instance.faces,
          ...packPreviewMesh(result.mesh),
        });
        rendered.set(instance.id, next);
      } catch (error) {
        errors.push(error instanceof Error ? error.message : String(error));
      }
    }
    self.postMessage(
      {
        meshes,
        processedIds,
        error: errors.join("; ") || undefined,
        elapsedMs: performance.now() - messageStarted,
      },
      meshes.flatMap(({ positions, indices }) => [positions.buffer, indices.buffer]),
    );
  } catch (error) {
    self.postMessage({ error: error instanceof Error ? error.message : String(error) });
  }
};
