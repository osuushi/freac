import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { launchElectron } from "./native-documents.mjs";
import { drag, settled } from "./ui-helpers.mjs";
import { chooseTool } from "./ui-tools.mjs";

const app = await launchElectron({ args: ["."], env: { ...process.env, FREAC_TEST_HIDDEN: "1" } });
try {
  const page = await app.firstWindow();
  await page.evaluate(() =>
    window.freacAgent.request({
      kind: "configure",
      preferences: {
        preset: "custom",
        executable: "/bin/sh",
        args: ["-i"],
        env: {},
      },
    }),
  );
  await page.getByRole("button", { name: "Open agent terminal" }).click();
  await page.locator(".agent-status").filter({ hasText: "Running" }).waitFor();
  await chooseTool(page, "Sketch on XY", "sketch-xy");
  await page.keyboard.press("r");
  await drag(page, [-10, -6], [10, 6]);
  await settled(page);
  const before = await page.evaluate(() => JSON.stringify(window.freacInspect().document));
  const input = page.locator(".agent-screen textarea");
  const workspace = (await page.evaluate(() => window.freacAgent.request({ kind: "read" })))
    .workspace;
  await writeFile(
    join(workspace, "pending.ts"),
    `
await freac.createSketch({plane:"XY",curves:[{kind:"circle",center:{x:0,y:0},radius:5}]});
console.error("candidate ready"); while (true) {}
`,
  );
  await input.focus();
  await page.keyboard.type("freac run pending.ts 2> pending.err");
  await page.keyboard.press("Enter");
  await page.getByRole("button", { name: "Cancel script", exact: true }).waitFor();
  for (let i = 0; i < 200; i++) {
    if ((await readFile(join(workspace, "pending.err"), "utf8")).includes("candidate ready")) break;
    await new Promise((resolve) => setTimeout(resolve, 30));
  }
  assert.match(await readFile(join(workspace, "pending.err"), "utf8"), /candidate ready/);
  for (const responses of [[1]]) {
    await app.evaluate(
      ({ dialog }, responses) => {
        globalThis.quitPrompts = [];
        dialog.showMessageBox = async (_window, options) => {
          globalThis.quitPrompts.push(options.message);
          return { response: responses.shift() };
        };
      },
      [...responses],
    );
    await input.focus();
    await app.evaluate(({ BrowserWindow }) => {
      const contents = BrowserWindow.getAllWindows()[0].webContents;
      contents.sendInputEvent({ type: "keyDown", keyCode: "Q", modifiers: ["meta"] });
      contents.sendInputEvent({ type: "keyUp", keyCode: "Q", modifiers: ["meta"] });
    });
    for (let i = 0; i < 100; i++) {
      if ((await app.evaluate(() => globalThis.quitPrompts.length)) === responses.length) break;
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    assert.equal(await app.evaluate(() => globalThis.quitPrompts.length), responses.length);
    assert.equal(await page.evaluate(() => JSON.stringify(window.freacInspect().document)), before);
    assert.equal(await page.evaluate(() => window.freacInspect().busy), false);
    assert.equal(
      (await page.evaluate(() => window.freacAgent.request({ kind: "read" }))).running,
      false,
    );
  }
  await app.evaluate(({ dialog }) => {
    dialog.showMessageBox = async (_window, options) => ({
      response: options.buttons?.[0] === "Save" ? 2 : 0,
    });
  });
  await input.focus();
  const closed = page.waitForEvent("close");
  await app.evaluate(({ BrowserWindow }) => {
    const contents = BrowserWindow.getAllWindows()[0].webContents;
    contents.sendInputEvent({ type: "keyDown", keyCode: "Q", modifiers: ["meta"] });
    contents.sendInputEvent({ type: "keyUp", keyCode: "Q", modifiers: ["meta"] });
  });
  await closed;
  console.log(
    "PASS terminal Command-Q during CPU-bound script: candidate discarded, one save/cancel choice, stopped agent on cancellation, accepted quit",
  );
} finally {
  await app
    .evaluate(({ dialog }) => {
      dialog.showMessageBox = async (_window, options) => ({
        response: options.buttons?.[0] === "Save" ? 2 : 0,
      });
    })
    .catch(() => {});
  await app.close();
}
