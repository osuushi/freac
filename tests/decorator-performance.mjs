import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { chromium, webkit } from "playwright";
import { createServer } from "vite";
import { DocumentOwner } from "../.build/host/backend/document-owner.js";
import { roundBody } from "../.cache/sketch-tests/tests/decorator-domain-fixtures.js";

const cases = [];
for (const [name, length, count] of [
  ["short", 10, 1],
  ["long", 80, 1],
  ["batch", 20, 6],
]) {
  const owner = new DocumentOwner();
  try {
    const faces = [];
    for (let i = 0; i < count; i++) {
      const body = await roundBody(owner, [5], length);
      if (i)
        assert.equal(
          (
            await owner.call({
              kind: "transform-bodies",
              transform: {
                ids: [body.id],
                translation: [i * 15, 0, 0],
                pivot: [0, 0, 0],
                axis: [0, 0, 1],
                angle: 0,
                duplicate: false,
              },
            })
          ).error,
          undefined,
        );
      faces.push(
        ...body.faces.filter((f) => f.cylinder).map((f) => ({ body: body.id, face: f.id })),
      );
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
    const accepted = owner.view.data;
    const start = performance.now();
    const snapshot = await owner.call({ kind: "export-geometry" });
    assert.equal(snapshot.error, undefined);
    assert.ok(snapshot.exportDocument);
    cases.push({
      name,
      length,
      count,
      preparationMs: performance.now() - start,
      preview: accepted,
      document: snapshot.exportDocument,
    });
    assert.equal(owner.view.data, accepted);
  } finally {
    owner.close();
  }
}
const server = await createServer({ server: { port: 0, watch: null, hmr: false } });
await server.listen();
const results = [];
try {
  for (const [browserName, engine] of Object.entries({ chromium, webkit })) {
    const browser = await engine.launch({ headless: true });
    try {
      for (const scenario of cases) {
        const page = await browser.newPage();
        await page.goto(server.resolvedUrls.local[0]);
        const measurements = await page.evaluate(
          async ({ scenario, previewPath, exportPath }) => {
            const { default: PreviewWorker } = await import(previewPath);
            const { default: ExportWorker } = await import(exportPath);
            const result = [];
            for (const [kind, WorkerClass] of [
              ["preview", PreviewWorker],
              ["export", ExportWorker],
            ]) {
              for (const temperature of ["cold", "warm"]) {
                const start = performance.now();
                const worker = new WorkerClass();
                try {
                  const data = await new Promise((resolve, reject) => {
                    const timer = setTimeout(
                      () => reject(new Error(`${kind} exceeded 120 seconds`)),
                      120000,
                    );
                    worker.onmessage = (event) => {
                      clearTimeout(timer);
                      resolve(event.data);
                    };
                    worker.onerror = (event) => {
                      clearTimeout(timer);
                      reject(new Error(event.message));
                    };
                    worker.postMessage({
                      document: kind === "preview" ? scenario.preview : scenario.document,
                      format: "3mf",
                    });
                  });
                  if (data.error) throw new Error(data.error);
                  if (kind === "export" && !(data.bytes?.length > 100))
                    throw new Error("Missing export bytes");
                  if (kind === "preview" && data.meshes?.length !== scenario.count)
                    throw new Error("Missing preview meshes");
                  result.push({
                    kind,
                    temperature,
                    milliseconds: performance.now() - start,
                    ...(kind === "export"
                      ? { bytes: data.bytes.length }
                      : {
                          triangles: data.meshes.reduce((n, m) => n + m.mesh.triangles.length, 0),
                        }),
                  });
                } finally {
                  worker.terminate();
                }
              }
            }
            return result;
          },
          {
            scenario,
            previewPath: `/@fs/${resolve("src/decorators/preview-worker.ts")}?worker`,
            exportPath: `/@fs/${resolve("src/model/export-worker.ts")}?worker`,
          },
        );
        const result = {
          browser: browserName,
          name: scenario.name,
          diameter: 10,
          pitch: 1.5,
          length: scenario.length,
          count: scenario.count,
          preparationMs: scenario.preparationMs,
          measurements,
        };
        results.push(result);
        console.log(JSON.stringify(result));
        await page.close();
      }
    } finally {
      await browser.close();
    }
  }
  await mkdir(".cache/sketch-review", { recursive: true });
  await writeFile(
    ".cache/sketch-review/decorator-performance.json",
    JSON.stringify(results, null, 2),
  );
} finally {
  await server.close();
}
