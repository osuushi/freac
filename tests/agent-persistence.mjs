import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, symlink, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { chromium, webkit } from "playwright";
import { createServer } from "vite";
import { readPortableArchive } from "../.build/host/model/portable-archive.js";
import { launchElectron, openDocument, saveDocument } from "./native-documents.mjs";
import { drag, settled } from "./ui-helpers.mjs";
import { chooseTool } from "./ui-tools.mjs";

const root = await mkdtemp(join(tmpdir(), "freac-persistence-"));
const file = join(root, "drawing.freac"),
  copy = join(root, "copy.freac");
const app = await launchElectron({ args: ["."], env: { ...process.env, FREAC_TEST_HIDDEN: "1" } });
let portable;
try {
  const page = await app.firstWindow();
  await page.evaluate(() =>
    window.freacAgent.request({
      kind: "configure",
      preferences: { preset: "custom", executable: "/bin/sh", args: ["-i"], env: {} },
    }),
  );
  await page.getByRole("button", { name: "Open agent terminal" }).click();
  await page.locator(".agent-status").filter({ hasText: "Running" }).waitFor();
  await page.getByRole("button", { name: "Sketch on XY" }).click();
  await page.keyboard.press("r");
  await drag(page, [-10, -6], [10, 6]);
  await settled(page);
  const model = await page.evaluate(() =>
    JSON.stringify({
      ...window.freacInspect().document,
      bodies: window.freacInspect().document.bodies ?? [],
    }),
  );
  const workspace = (await page.evaluate(() => window.freacAgent.request({ kind: "read" })))
    .workspace;
  const input = page.locator(".agent-screen textarea");
  await input.focus();
  await page.keyboard.type('printf "remember this design" > notes.txt');
  await page.keyboard.press("Enter");
  await until(
    async () => (await readFile(join(workspace, "notes.txt"), "utf8")) === "remember this design",
  );
  await writeFile(join(workspace, "binary.dat"), new Uint8Array([0, 255, 128, 1]));
  const home = join(dirname(workspace), "codex");
  await mkdir(join(home, "sessions"), { recursive: true });
  await writeFile(
    join(home, "sessions", "rollout.jsonl"),
    '{"type":"response_item","payload":{"role":"assistant","content":[{"text":"Keep the wall 3 mm."}]}}\n',
  );
  await writeFile(join(home, "auth.json"), "DO-NOT-ARCHIVE");
  await saveDocument(page, file);
  portable = readPortableArchive(await readFile(file));
  assert.equal(
    new TextDecoder().decode(portable.files["workspace/notes.txt"]),
    "remember this design",
  );
  assert.deepEqual([...portable.files["workspace/binary.dat"]], [0, 255, 128, 1]);
  assert(Object.keys(portable.files).some((p) => p.startsWith("conversations/")));
  assert(!Object.keys(portable.files).some((p) => p.includes("auth.json")));
  await until(async () => !(await page.evaluate(() => window.freacDocument.status())).edited);
  const savedBytes = await readFile(file);
  await symlink(file, join(workspace, "linked.freac"));
  await chooseTool(page, "save document", "save");
  await page.getByRole("status").filter({ hasText: "link or special" }).waitFor();
  assert.deepEqual(await readFile(file), savedBytes);
  assert.equal((await page.evaluate(() => window.freacDocument.status())).edited, true);
  await unlink(join(workspace, "linked.freac"));
  await input.focus();
  await page.keyboard.type('printf "changed" > notes.txt');
  await page.keyboard.press("Enter");
  await until(async () => (await page.evaluate(() => window.freacDocument.status())).edited);
  await app.evaluate(({ dialog }) => {
    dialog.showMessageBox = async () => ({ response: 1 });
  });
  await chooseTool(page, "new document", "new");
  assert.equal(
    await page.evaluate(() =>
      JSON.stringify({
        ...window.freacInspect().document,
        bodies: window.freacInspect().document.bodies ?? [],
      }),
    ),
    model,
  );
  await app.evaluate(({ dialog, Menu }, path) => {
    dialog.showSaveDialog = async () => ({ canceled: false, filePath: path });
    const item = Menu.getApplicationMenu()
      .items.find((i) => i.label === "File")
      .submenu.items.find((i) => i.label === "Save As…");
    item.click();
  }, copy);
  await until(async () => {
    await readFile(copy);
    return true;
  });
  assert.equal(
    new TextDecoder().decode(
      readPortableArchive(await readFile(copy)).files["workspace/notes.txt"],
    ),
    "changed",
  );
  await until(async () => !(await page.evaluate(() => window.freacDocument.status())).edited);
  await app.evaluate(({ dialog }) => {
    dialog.showMessageBox = async (_w, o) => {
      if (o.buttons?.[0] === "Stop and continue")
        await new Promise((resolve) => {
          globalThis.answerStop = resolve;
        });
      return { response: 0 };
    };
  });
  await chooseTool(page, "new document", "new");
  await until(() => app.evaluate(() => !!globalThis.answerStop));
  await writeFile(join(workspace, "shutdown.txt"), "late write");
  await app.evaluate(() => {
    globalThis.answerStop();
    globalThis.answerStop = null;
  });
  await settled(page);
  await until(async () => (await page.evaluate(() => window.freacDocument.status())).path === null);
  assert.equal(
    new TextDecoder().decode(
      readPortableArchive(await readFile(copy)).files["workspace/shutdown.txt"],
    ),
    "late write",
  );
  await openDocument(page, file);
  await settled(page);
  const restored = (await page.evaluate(() => window.freacAgent.request({ kind: "read" })))
    .workspace;
  assert.notEqual(restored, workspace);
  assert.equal(await readFile(join(restored, "notes.txt"), "utf8"), "remember this design");
  assert.equal(
    await page.evaluate(() =>
      JSON.stringify({
        ...window.freacInspect().document,
        bodies: window.freacInspect().document.bodies ?? [],
      }),
    ),
    model,
  );
  await writeFile(
    join(dirname(restored), "codex", "sessions", "rollout.jsonl"),
    "conversation-only edit\n",
  );
  await until(async () => (await page.evaluate(() => window.freacDocument.status())).edited);
  await chooseTool(page, "save document", "save");
  await until(async () => !(await page.evaluate(() => window.freacDocument.status())).edited);
  // Recovery imports files/conversation without replacing geometry.
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await app.evaluate(({ dialog }, path) => {
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [path] });
  }, dirname(workspace));
  await page.getByRole("button", { name: "Recover agent files…" }).click();
  await until(
    async () =>
      (await page.evaluate(() => window.freacAgent.request({ kind: "read" }))).workspace !==
      restored,
  );
  assert.equal(
    await page.evaluate(() =>
      JSON.stringify({
        ...window.freacInspect().document,
        bodies: window.freacInspect().document.bodies ?? [],
      }),
    ),
    model,
  );
  assert.equal((await page.evaluate(() => window.freacDocument.status())).edited, true);
  await page.screenshot({ path: ".cache/sketch-review/agent-persistence.png" });
  console.log(
    "PASS Electron portable workspace: real shell files, binary/conversation Save, Save As, dirty/cancel, Open and recovery",
  );
} catch (error) {
  await rm(root, { recursive: true, force: true });
  throw error;
} finally {
  await app
    .evaluate(({ dialog }) => {
      dialog.showMessageBox = async (_w, o) => ({ response: o.buttons?.[0] === "Save" ? 2 : 0 });
    })
    .catch(() => {});
  const page = app.windows()[0];
  if (page && !page.isClosed()) {
    await page.evaluate(() => window.freacAgent.request({ kind: "stop" })).catch(() => {});
    await page.waitForFunction(() => !window.freacInspect().busy).catch(() => {});
  }
  await app.close();
}
const server = await createServer({ server: { port: 0 } });
await server.listen();
try {
  for (const [name, engine] of Object.entries({ chromium, webkit })) {
    const browser = await engine.launch({ headless: true });
    try {
      const page = await browser.newPage();
      await page.goto(server.resolvedUrls.local[0]);
      // Use the original portable payload for exact-byte browser preservation.
      await page.getByLabel("Open Freac file").setInputFiles(copy);
      await settled(page);
      const download = page.waitForEvent("download");
      await chooseTool(page, "save document", "save");
      const path = join(root, `${name}.freac`);
      await (await download).saveAs(path);
      assert.deepEqual(
        readPortableArchive(await readFile(path)).files,
        readPortableArchive(await readFile(copy)).files,
      );
      console.log(`PASS ${name}: portable files and conversations survive upload/download`);
    } finally {
      await browser.close();
    }
  }
} finally {
  await server.close();
  await rm(root, { recursive: true, force: true });
}

async function until(check) {
  for (let i = 0; i < 150; i++) {
    try {
      if (await check()) return;
    } catch {}
    await new Promise((r) => setTimeout(r, 30));
  }
  throw new Error("Persistence did not reach expected state");
}
