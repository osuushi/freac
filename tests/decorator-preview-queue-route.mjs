import { Scene } from "three";
import { PreviewOverlaySurfaces } from "../src/decorators/preview-overlay-surfaces.ts";
import { PreviewQueue } from "../src/decorators/preview-queue.ts";
import { previewSignatures } from "../src/decorators/preview-signatures.ts";
import { placedDocument } from "../src/model/body-placement.ts";

const NativeWorker = window.Worker;

function delayedWorker() {
  let release, reached;
  const waiting = new Promise((resolve) => {
    release = resolve;
  });
  const held = new Promise((resolve) => {
    reached = resolve;
  });
  let created = 0;
  window.Worker = class extends NativeWorker {
    constructor(...args) {
      super(...args);
      created++;
    }
    set onmessage(handler) {
      let first = true;
      super.onmessage = (event) => {
        if (first) {
          first = false;
          reached();
          void waiting.then(() => handler.call(this, event));
        } else handler.call(this, event);
      };
    }
  };
  return { held, release, count: () => created };
}

async function until(predicate) {
  const start = performance.now();
  while (!predicate()) {
    if (performance.now() - start > 30000) throw new Error("Preview queue timeout");
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

async function race(document, next, live) {
  const delay = delayedWorker(),
    scene = new Scene(),
    results = [];
  let current = previewSignatures(document, "[]");
  const surfaces = new PreviewOverlaySurfaces({
    bodiesVisible: true,
    visibility: { visible: () => true },
    world: {
      scene,
      renderOverlays: new Set(),
      renderForegroundOverlays: new Set(),
      requestDraw() {},
    },
  });
  const queue = new PreviewQueue(
    (response, request) => {
      surfaces.replace(
        response.meshes ?? [],
        response.processedIds ?? [],
        request.signatures,
        current,
        request.live,
      );
      results.push({
        processed: response.processedIds,
        visible: scene.children[0].children.map((mesh) => mesh.userData.body),
        error: response.error,
      });
    },
    () => {
      throw new Error("Preview worker failed");
    },
  );
  try {
    queue.submit(document, [], false, false, current);
    await delay.held;
    current = previewSignatures(next, "[]");
    surfaces.sync(current);
    queue.submit(next, [], live, false, current);
    delay.release();
    await until(() => results.length === 2);
    return { results, workers: delay.count() };
  } finally {
    delay.release();
    queue.dispose();
    surfaces.dispose();
    window.Worker = NativeWorker;
  }
}

async function cleared(document) {
  const delay = delayedWorker(),
    delivered = [];
  const queue = new PreviewQueue(
    (response) => delivered.push(response),
    () => {},
  );
  try {
    queue.submit(document, [], false);
    await delay.held;
    queue.clear();
    delay.release();
    await new Promise((resolve) => setTimeout(resolve, 50));
  } finally {
    queue.dispose();
    window.Worker = NativeWorker;
  }
  return delivered.length;
}

export async function previewQueueRoute(document) {
  const ids = document.decorators.map((instance) => instance.id);
  const next = placedDocument(document, {
    ids: [document.bodies[1].id],
    pivot: [0, 0, 0],
    axis: [0, 0, 1],
    angle: 0,
    translation: [10, 0, 0],
    duplicate: false,
  });
  return {
    ids,
    bodies: document.bodies.map((body) => body.id),
    settled: await race(document, next, false),
    live: await race(document, next, true),
    cleared: await cleared(document),
  };
}
