import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { _electron } from "playwright";

const directory = await mkdtemp(join(tmpdir(), "freac-window-size-"));
const preference = join(directory, "window-size.json");
let app;
async function launch() {
  app = await _electron.launch({
    args: [".", `--user-data-dir=${directory}`],
    env: { ...process.env, FREAC_TEST_HIDDEN: "1" },
  });
  const page = await app.firstWindow();
  await page.waitForFunction(() => !!window.freacInspect);
  return app.evaluate(({ BrowserWindow, screen }) => {
    const window = BrowserWindow.getAllWindows()[0];
    if (window.isVisible()) throw new Error("Expected an isolated hidden window");
    const { width, height } = window.getBounds();
    return { width, height, available: screen.getPrimaryDisplay().workAreaSize };
  });
}
async function close() {
  if (!app) return;
  const current = app;
  app = undefined;
  let timedOut = false;
  const timeout = setTimeout(() => {
    timedOut = true;
    current.process().kill("SIGKILL");
  }, 10000);
  try {
    await current.close();
    assert.equal(timedOut, false, "Electron should quit normally");
  } finally {
    clearTimeout(timeout);
  }
}
try {
  const initial = await launch();
  assert.equal(initial.width, Math.min(1280, initial.available.width));
  assert.equal(initial.height, Math.min(850, initial.available.height));
  const resized = await app.evaluate(({ BrowserWindow }) => {
    const window = BrowserWindow.getAllWindows()[0];
    window.setSize(940, 620);
    const { width, height } = window.getBounds();
    return { width, height };
  });
  await close();
  assert.deepEqual(JSON.parse(await readFile(preference, "utf8")), resized);
  const restored = await launch();
  assert.equal(restored.width, resized.width);
  assert.equal(restored.height, resized.height);
  await close();
  await writeFile(preference, '{"width":999999,"height":999999}');
  const oversized = await launch();
  assert.equal(oversized.width, oversized.available.width);
  assert.equal(oversized.height, oversized.available.height);
  await close();
  for (const invalid of ['{"width":-1,"height":620}', "broken JSON"]) {
    await writeFile(preference, invalid);
    const fallback = await launch();
    assert.equal(fallback.width, initial.width);
    assert.equal(fallback.height, initial.height);
    await close();
  }
  console.log("Hidden Electron: resize/quit/relaunch, screen fit and invalid preferences passed");
} finally {
  await close();
  await rm(directory, { recursive: true, force: true });
}
