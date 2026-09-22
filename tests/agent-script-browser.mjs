import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { chromium, webkit } from "playwright";
import { createServer } from "vite";
import { DocumentOwner } from "../.build/host/backend/document-owner.js";
import { ScriptSession } from "../.build/host/backend/script-session.js";
import { prepareOrientation } from "../.build/host/host/agent-orientation.js";

/** Test-owned web transport; same script session, CLI and owner as desktop. */
export async function scriptBrowser(name) {
  const owner = new DocumentOwner();
  const workspace = await mkdtemp(join(tmpdir(), "freac-script-web-"));
  let page, browser, server, connection;
  const session = new ScriptSession(
    owner,
    () => page.evaluate(() => window.scriptInspection(false, true)),
    (running, view) => {
      // Match the browser backend's JSON transport, including normalization of signed zero.
      void page.evaluate((state) => window.scriptState(state), {
        running,
        view: JSON.parse(JSON.stringify(view)),
      });
    },
    () => true,
    () => {},
  );
  try {
    server = await createServer({
      configFile: false,
      root: resolve("src/sketch"),
      server: { port: 0, watch: null, hmr: false },
      plugins: [
        {
          name: "script-test-owner",
          configureServer(server) {
            server.middlewares.use("/sketch-api", async (req, res) => {
              let body = "";
              for await (const chunk of req) body += chunk;
              res.setHeader("Content-Type", "application/json");
              res.end(JSON.stringify(await owner.call(JSON.parse(body))));
            });
          },
        },
      ],
    });
    await server.listen();
    browser = await { chromium, webkit }[name].launch({ headless: true });
    page = await browser.newPage({ viewport: { width: 1280, height: 850 } });
    await page.exposeFunction("cancelScript", () => session.cancel());
    await page.addInitScript(() => {
      window.freacInspection = {
        onRequest(callback) {
          window.scriptInspection = callback;
          return () => {};
        },
      };
      window.freacScript = {
        cancel: () => window.cancelScript(),
        onState(callback) {
          window.scriptState = callback;
          return () => {};
        },
      };
    });
    await page.goto(server.resolvedUrls.local[0]);
    const env = { ...process.env };
    connection = await prepareOrientation(
      workspace,
      env,
      () => ({ name: "Test", edited: true }),
      async () => {
        throw new Error("Inspection covered by separate suite");
      },
      (request, channel) => session.request(request, channel),
    );
    return {
      page,
      workspace,
      env,
      async close() {
        await session.cancel();
        await connection.close();
        owner.close();
        await browser.close();
        await server.close();
        await rm(workspace, { recursive: true, force: true });
      },
    };
  } catch (error) {
    await session.cancel();
    await connection?.close();
    owner.close();
    await browser?.close();
    await server?.close();
    await rm(workspace, { recursive: true, force: true });
    throw error;
  }
}
