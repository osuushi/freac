import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readPortableArchive } from "../.build/host/model/portable-archive.js";
import { launchElectron, saveDocument } from "./native-documents.mjs";

const root = await mkdtemp(join(tmpdir(), "freac-quit-save-"));
try {
  for (const late of [false, true]) {
    const app = await launchElectron({
      args: ["."],
      env: { ...process.env, FREAC_TEST_HIDDEN: "1" },
    });
    try {
      const page = await app.firstWindow();
      page.setDefaultTimeout(10000);
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
      const workspace = (await page.evaluate(() => window.freacAgent.request({ kind: "read" })))
        .workspace;
      if (late) {
        await page.locator(".agent-screen textarea").focus();
        await page.keyboard.type(
          "trap 'printf final-write > shutdown.txt; exit 0' HUP TERM; touch ready",
        );
        await page.keyboard.press("Enter");
        for (let i = 0; i < 100; i++) {
          try {
            await readFile(join(workspace, "ready"));
            break;
          } catch {}
          await new Promise((r) => setTimeout(r, 30));
        }
        await readFile(join(workspace, "ready"));
      }
      const file = join(root, `${late}.freac`),
        log = join(root, `${late}.jsonl`);
      await saveDocument(page, file);
      await app.evaluate(async ({ dialog }, log) => {
        const { appendFileSync } = process.getBuiltinModule("fs");
        dialog.showMessageBox = async (_w, options) => {
          appendFileSync(log, `${JSON.stringify(options.buttons)}\n`);
          return { response: 0 };
        };
      }, log);
      await page.locator(".agent-screen textarea").focus();
      const closed = page.waitForEvent("close");
      await app.evaluate(({ BrowserWindow }) => {
        BrowserWindow.getAllWindows()[0].webContents.sendInputEvent({
          type: "keyDown",
          keyCode: "Q",
          modifiers: ["meta"],
        });
      });
      await closed;
      const prompts = await readFile(log, "utf8").catch(() => "");
      if (late) {
        assert.equal(prompts.trim().split("\n").length, 1);
        assert.equal(JSON.parse(prompts)[0], "Save");
        const archive = readPortableArchive(await readFile(file));
        assert.equal(
          new TextDecoder().decode(archive.files["workspace/shutdown.txt"]),
          "final-write",
        );
      } else assert.equal(prompts, "");
    } finally {
      await app.close();
    }
  }
  console.log(
    "PASS native quit: clean running agent quits without dialog; shutdown writes trigger one save and survive archive",
  );
} finally {
  await rm(root, { recursive: true, force: true });
}
