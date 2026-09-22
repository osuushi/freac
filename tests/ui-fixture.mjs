import assert from "node:assert/strict";
import { readFile, realpath, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, sep } from "node:path";
import { plate } from "./ui-body-fillet.mjs";
import { inspect } from "./ui-helpers.mjs";
import { chooseTool } from "./ui-tools.mjs";
export async function fixtureRoute(page, name, app) {
  await plate(page);
  await chooseTool(page, "chamfer", "chamfer");
  await page.getByRole("textbox", { name: "Chamfer distance" }).fill("2");
  const before = await inspect(page);
  const history = JSON.parse(JSON.stringify(await page.evaluate(() => window.freacHistory())));
  await chooseTool(page, "capture fixture", "capture");
  const pathField = page.getByRole("textbox", { name: "Captured fixture path" });
  await pathField.waitFor({ state: "visible" });
  const storedBefore = JSON.parse(JSON.stringify(before));
  const path = await pathField.inputValue(),
    fixture = JSON.parse(await readFile(path, "utf8"));
  assert.ok((await realpath(path)).startsWith((await realpath(tmpdir())) + sep));
  await checkDownload(page, app, path, fixture);
  if (app) {
    await app.evaluate(({ BrowserWindow, shell }) => {
      const contents = BrowserWindow.getAllWindows()[0].webContents;
      contents.startDrag = (item) => {
        globalThis.fixtureDrag = { file: item.file, emptyIcon: item.icon.isEmpty() };
      };
      shell.showItemInFolder = (path) => {
        globalThis.fixtureReveal = path;
      };
    });
    const tile = await page.getByRole("link", { name: "Download captured fixture" }).boundingBox();
    await page.mouse.move(tile.x + 30, tile.y + tile.height / 2);
    await page.mouse.down();
    await page.mouse.move(tile.x + 100, tile.y + tile.height / 2, { steps: 12 });
    await page.mouse.up();
    assert.deepEqual(await app.evaluate(() => globalThis.fixtureDrag), {
      file: path,
      emptyIcon: false,
    });
    await page.getByRole("button", { name: "Show in folder" }).click();
    assert.equal(await app.evaluate(() => globalThis.fixtureReveal), path);
  }
  assert.deepEqual(fixture.snapshot.document, storedBefore.document);
  assert.deepEqual(fixture.snapshot.preview, storedBefore.preview);
  assert.deepEqual(fixture.snapshot.modelingSelection, before.modelingSelection);
  assert.equal(fixture.snapshot.lastEdit.kind, "finish-edges");
  assert.deepEqual(fixture.snapshot.history, history);
  assert.ok(history.some((entry) => entry.operation.kind === "extrude"));
  const after = await inspect(page);
  assert.deepEqual(after.document, before.document);
  assert.deepEqual(after.preview, before.preview);
  assert.deepEqual(after.interaction, before.interaction);
  const accepted = JSON.parse(await readFile(join(dirname(path), "accepted.freac"), "utf8"));
  const preview = JSON.parse(await readFile(join(dirname(path), "preview.freac"), "utf8"));
  assert.deepEqual(accepted.document, storedBefore.document);
  assert.deepEqual(preview.document, storedBefore.preview);
  await chooseTool(page, "capture fixture", "capture");
  await page.waitForFunction(
    (p) => document.querySelector('[aria-label="Captured fixture path"]').value !== p,
    path,
  );
  await page.screenshot({ path: `.cache/sketch-review/fixture-${name}.png` });
  const secondPath = await pathField.inputValue();
  await rm(dirname(path), { recursive: true, force: true });
  await rm(dirname(secondPath), { recursive: true, force: true });
  console.log(
    `${name}: fixture capture saves accepted/preview geometry and edit context without changing the live tool`,
  );
  await page.keyboard.press("Escape");
  await inspect(page);
}

async function checkDownload(page, app, path, fixture) {
  if (app) {
    await app.evaluate(
      ({ BrowserWindow }, destination) => {
        BrowserWindow.getAllWindows()[0].webContents.session.once(
          "will-download",
          (_event, item) => {
            item.setSavePath(destination);
            item.once("done", (_event, state) => {
              globalThis.fixtureDownload = state;
            });
          },
        );
      },
      join(dirname(path), "download.json"),
    );
  }
  if (app) {
    await page.getByRole("link", { name: "Download captured fixture" }).click();
    const deadline = Date.now() + 10000;
    while (!(await app.evaluate(() => globalThis.fixtureDownload)) && Date.now() < deadline)
      await new Promise((resolve) => setTimeout(resolve, 50));
    assert.equal(await app.evaluate(() => globalThis.fixtureDownload), "completed");
    assert.deepEqual(
      JSON.parse(await readFile(join(dirname(path), "download.json"), "utf8")),
      fixture,
    );
  } else {
    const downloadReady = page.waitForEvent("download");
    await page.getByRole("link", { name: "Download captured fixture" }).click();
    const download = await downloadReady;
    assert.match(download.suggestedFilename(), /^freac-fixture-.*\.json$/);
    assert.deepEqual(JSON.parse(await readFile(await download.path(), "utf8")), fixture);
  }
}
