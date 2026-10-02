import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { _electron } from "playwright";

const directory = await mkdtemp(join(tmpdir(), "makeshift-identity-"));
let app;
try {
  const legacy = join(directory, "Freac");
  const current = join(directory, "Makeshift");
  await mkdir(legacy);
  await writeFile(join(legacy, "window-size.json"), JSON.stringify({ width: 640, height: 480 }));
  const identity = pathToFileURL(resolve(".build/host/host/application-identity.js")).href;
  const windowSize = pathToFileURL(resolve(".build/host/host/window-size.js")).href;
  const entry = join(directory, "entry.mjs");
  await writeFile(
    entry,
    `import { app } from "electron";
     import { configureApplicationIdentity } from ${JSON.stringify(identity)};
     import { restoreWindowSize } from ${JSON.stringify(windowSize)};
     app.setPath("appData", ${JSON.stringify(directory)});
     app.setPath("userData", ${JSON.stringify(current)});
     configureApplicationIdentity();
     globalThis.configureIdentity = configureApplicationIdentity;
     app.whenReady().then(() => {
       globalThis.restoredSize = restoreWindowSize();
       app.dock?.hide();
     });`,
  );
  app = await _electron.launch({ args: [entry] });
  assert.equal(await app.evaluate(({ app }) => app.getName()), "Makeshift");
  assert.equal(await app.evaluate(({ app }) => app.getPath("userData")), legacy);
  assert.deepEqual(
    await app.evaluate(async ({ app }) => {
      await app.whenReady();
      return globalThis.restoredSize;
    }),
    { width: 640, height: 480 },
  );
  await mkdir(current);
  await app.evaluate(({ app }, current) => {
    app.setPath("userData", current);
    globalThis.configureIdentity();
  }, current);
  assert.equal(await app.evaluate(({ app }) => app.getPath("userData")), current);
  console.log("Hidden Electron: legacy preferences retained and current profile takes precedence");
} finally {
  await app?.close();
  await rm(directory, { recursive: true, force: true });
}
