import { chromium, webkit } from "playwright";
import { createServer } from "vite";
import { autoUnionRoute } from "./ui-auto-union.mjs";
import { booleanTargetsRoute } from "./ui-boolean-targets.mjs";
import { hiddenBodiesRoute, hiddenRevolveRoute } from "./ui-hidden-bodies.mjs";

const server = await createServer({ server: { port: 0 } });
await server.listen();
try {
  for (const [name, engine] of Object.entries({ chromium, webkit })) {
    const browser = await engine.launch({ headless: true });
    try {
      const page = await browser.newPage({ viewport: { width: 1280, height: 850 } });
      await page.goto(server.resolvedUrls.local[0]);
      await hiddenBodiesRoute(page);
      await hiddenBodiesRoute(page, true);
      await booleanTargetsRoute(page, true);
      await booleanTargetsRoute(page);
      await autoUnionRoute(page, name);
      await hiddenRevolveRoute(page);
      console.log(`${name}: hidden bodies, global hide, mixed targets, Undo/Redo passed`);
    } finally {
      await browser.close();
    }
  }
} finally {
  await server.close();
}
