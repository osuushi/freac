import type { SketchDocument } from "../sketch/document.js";
import type { SketchEditor } from "../sketch/editor.js";
import { PreviewOverlaySurfaces } from "./preview-overlay-surfaces.js";
import { PreviewQueue } from "./preview-queue.js";
import { previewFingerprint, previewSignatures } from "./preview-signatures.js";
import { threadDefinition } from "./thread-settings.js";

export function decoratorOverlay(editor: SketchEditor): () => void {
  const surfaces = new PreviewOverlaySurfaces(editor);
  let previous: SketchDocument | null = null;
  let sourcesKey = "";
  let signatureKey = "";
  let currentSignatures = new Map<string, string>();
  let previousLive = false;
  let settleTimer: ReturnType<typeof setTimeout> | undefined;
  const queue = new PreviewQueue(
    (response, request) => {
      surfaces.replace(
        response.meshes ?? [],
        response.processedIds ?? [],
        request.signatures,
        currentSignatures,
        request.live,
      );
      if (response.error) {
        editor.notice = `Decorator preview: ${response.error}`;
        editor.refresh();
      }
    },
    () => {
      editor.notice = "Decorator preview unavailable";
      editor.refresh();
    },
  );
  const update = () => {
    surfaces.updateVisibility();
    const document = editor.display;
    const nextSources = JSON.stringify(editor.store.decoratorSources);
    if (document === previous && nextSources === sourcesKey) return;
    const signatures = previewSignatures(document, nextSources);
    const nextSignatureKey = previewFingerprint(signatures, false);
    const live = editor.candidate !== null;
    const needsPreview =
      previous === null || nextSignatureKey !== signatureKey || (!live && previousLive);
    if (previous !== null) surfaces.sync(signatures);
    previous = document;
    sourcesKey = nextSources;
    signatureKey = nextSignatureKey;
    currentSignatures = signatures;
    previousLive = live;
    if (!needsPreview) return;
    clearTimeout(settleTimer);
    if (!document.decorators?.length) {
      queue.clear();
      surfaces.clear();
      return;
    }
    const hasCustom = document.decorators.some(
      (instance) => instance.definition !== threadDefinition,
    );
    queue.submit(document, editor.store.decoratorSources, live, hasCustom, signatures);
    if (live) {
      // Paused candidates get full detail; a resumed gesture replaces the waiting job.
      settleTimer = setTimeout(
        () => {
          if (editor.display === document && sourcesKey === nextSources)
            queue.submit(document, editor.store.decoratorSources, false, false, signatures);
        },
        hasCustom ? 100 : 250,
      );
    }
  };
  editor.world.changed.add(update);
  return () => {
    clearTimeout(settleTimer);
    queue.dispose();
    surfaces.dispose();
    editor.world.changed.delete(update);
  };
}
