import assert from "node:assert/strict";
import { resolve } from "node:path";
import { chromium, webkit } from "playwright";
import { createServer } from "vite";

const server = await createServer({ server: { port: 0 } });
await server.listen();
try {
  for (const [name, engine] of Object.entries({ chromium, webkit })) {
    const browser = await engine.launch({ headless: true });
    try {
      const page = await browser.newPage();
      page.on("console", (message) => {
        if (message.type() === "error") console.error(message.text());
      });
      page.on("requestfailed", (request) => console.error(request.url(), request.failure()));
      await page.goto(server.resolvedUrls.local[0]);
      const result = await page.evaluate(
        async (path) => {
          const { default: DecoratorWorker } = await import(path);
          return new Promise((resolve, reject) => {
            const worker = new DecoratorWorker();
            const timer = setTimeout(() => {
              worker.terminate();
              reject(new Error("Decorator worker timeout"));
            }, 10000);
            worker.onmessage = (event) => {
              clearTimeout(timer);
              worker.terminate();
              resolve(event.data);
            };
            worker.onerror = (event) => {
              clearTimeout(timer);
              worker.terminate();
              reject(new Error(event.message));
            };
            worker.postMessage({
              source:
                "export default { generate(input) { return { value: input.value * 3, network: typeof fetch, host: typeof process }; } };",
              hook: "generate",
              input: { value: 4 },
            });
          });
        },
        `/@fs/${resolve("src/decorators/javascript-worker.ts")}?worker`,
      );
      assert.deepEqual(result, { result: { value: 12, network: "undefined", host: "undefined" } });
      console.log(`${name}: isolated bundled JavaScript worker passed`);
    } finally {
      await browser.close();
    }
  }
} finally {
  await server.close();
}
