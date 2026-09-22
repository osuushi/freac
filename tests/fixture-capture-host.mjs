import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { isAbsolute, relative } from "node:path";
import { launchElectron } from "./native-documents.mjs";
import { inspect } from "./ui-helpers.mjs";
import { chooseTool } from "./ui-tools.mjs";

const app = await launchElectron({
  args: ["."],
  env: { ...process.env, FREAC_TEST_HIDDEN: "1" },
});
try {
  const page = await app.firstWindow();
  const before = await inspect(page);
  const root = await app.evaluate(({ app, BrowserWindow }) => {
    assertHidden(BrowserWindow.getAllWindows()[0].isVisible());
    // Exercise the packaged destination branch through the real preload/IPC.
    Object.defineProperty(app, "isPackaged", { value: true });
    process.chdir("/");
    return app.getPath("userData");
    function assertHidden(visible) {
      if (visible) throw new Error("Expected hidden window");
    }
  });
  await chooseTool(page, "capture fixture", "capture");
  const field = page.getByRole("textbox", { name: "Captured fixture path" });
  await field.waitFor();
  const path = await field.inputValue();
  assert.ok(!relative(root, path).startsWith("..") && !isAbsolute(relative(root, path)));
  const fixture = JSON.parse(await readFile(path, "utf8"));
  assert.deepEqual(fixture.snapshot.document, before.document);
  assert.deepEqual((await inspect(page)).document, before.document);
  console.log("Hidden Electron capture uses writable app data with cwd=/");
} finally {
  await app.close();
}
