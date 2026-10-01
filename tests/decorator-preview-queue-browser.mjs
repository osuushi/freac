import assert from "node:assert/strict";
import { resolve } from "node:path";
import { chromium, webkit } from "playwright";
import { createServer } from "vite";
import { DocumentOwner } from "../.cache/sketch-tests/src/backend/document-owner.js";
import { roundBody } from "../.cache/sketch-tests/tests/decorator-domain-fixtures.js";

const owner = new DocumentOwner();
let document;
try {
  const faces = [];
  for (let i = 0; i < 2; i++) {
    const body = await roundBody(owner);
    const face = body.faces.find((face) => face.cylinder);
    assert.ok(face);
    faces.push({ body: body.id, face: face.id });
  }
  assert.equal(
    (
      await owner.call({
        kind: "decorator",
        edit: { action: "apply", definition: "freac.threads", faces },
      })
    ).error,
    undefined,
  );
  document = owner.view.data;
  assert.equal(document.decorators.length, 2);
} finally {
  owner.close();
}

const server = await createServer({ server: { port: 0, watch: null, hmr: false } });
await server.listen();
try {
  for (const [name, engine] of Object.entries({ chromium, webkit })) {
    const browser = await engine.launch({ headless: true });
    try {
      const page = await browser.newPage();
      await page.goto(`${server.resolvedUrls.local[0]}@fs/${resolve("tests/preview-empty.html")}`);
      const result = await page.evaluate(
        async ({ document, path }) => {
          const { previewQueueRoute } = await import(path);
          return previewQueueRoute(document);
        },
        { document, path: `/@fs/${resolve("tests/decorator-preview-queue-route.mjs")}` },
      );
      for (const state of [result.settled, result.live]) {
        assert.equal(state.workers, 1, "geometry changes retain the worker cache");
        assert.deepEqual(
          state.results.map((entry) => entry.processed),
          [result.ids, [result.ids[1]]],
        );
        assert.deepEqual(
          state.results.map((entry) => entry.visible),
          [[result.bodies[0]], result.bodies],
        );
        assert.ok(state.results.every((entry) => !entry.error));
      }
      assert.equal(result.cleared, 0, "Clear retires even a completed but delayed worker reply");
      console.log(
        `${name}: real preview worker retains A while B changes, filters stale meshes, and abandons Clear`,
      );
    } finally {
      await browser.close();
    }
  }
} finally {
  await server.close();
}
