import assert from "node:assert/strict";
import { access, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { launchElectron, saveDocument } from "./native-documents.mjs";

const root = await mkdtemp(join(tmpdir(), "freac-attach-ui-"));
const source = join(root, "photo one.png");
await writeFile(source, "file chooser bytes");
const app = await launchElectron({ args: ["."], env: { ...process.env, FREAC_TEST_HIDDEN: "1" } });
try {
  const page = await app.firstWindow();
  page.setDefaultTimeout(15000);
  await page.evaluate(() =>
    window.freacAgent.request({
      kind: "configure",
      preferences: { preset: "custom", executable: "/bin/sh", args: ["-i"], env: {} },
    }),
  );
  await page.getByRole("button", { name: "Open agent terminal" }).click();
  await page.locator(".agent-status").filter({ hasText: "Running" }).waitFor();
  const before = await page.evaluate(() => window.freacAgent.request({ kind: "read" }));
  assert(before.workspace);
  const terminal = page.locator(".agent-screen textarea");
  await terminal.focus();
  await page.keyboard.type("cp ");
  const chooser = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: "Attach file…" }).click();
  await (await chooser).setFiles(source);
  await waitFile(join(before.workspace, "attachments", "photo one.png"));
  await page.keyboard.type(" copied.png");
  await page.keyboard.press("Enter");
  await waitFile(join(before.workspace, "copied.png"));
  assert.equal(await readFile(join(before.workspace, "copied.png"), "utf8"), "file chooser bytes");

  await terminal.focus();
  await page.keyboard.type("cp ");
  await page.locator(".agent-dock").evaluate((panel) => {
    const transfer = new DataTransfer();
    transfer.items.add(new File(["dropped bytes"], "photo one.png", { type: "image/png" }));
    panel.dispatchEvent(
      new DragEvent("dragover", { bubbles: true, cancelable: true, dataTransfer: transfer }),
    );
    panel.dispatchEvent(
      new DragEvent("drop", { bubbles: true, cancelable: true, dataTransfer: transfer }),
    );
  });
  await waitFile(join(before.workspace, "attachments", "photo one (2).png"));
  await page.keyboard.type(" dropped.png");
  await page.keyboard.press("Enter");
  await waitFile(join(before.workspace, "dropped.png"));
  assert.equal(await readFile(join(before.workspace, "dropped.png"), "utf8"), "dropped bytes");
  assert.equal((await page.evaluate(() => window.freacDocument.status())).edited, true);

  const large = join(root, "large.bin");
  await writeFile(large, Buffer.alloc(21 * 1024 * 1024));
  const warningChooser = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: "Attach file…" }).click();
  await (await warningChooser).setFiles(large);
  const warning = page.getByRole("dialog");
  await warning.getByText(/bundled in the saved Freac drawing/).waitFor();
  await warning.getByRole("button", { name: "Cancel" }).click();
  await assert.rejects(access(join(before.workspace, "attachments", "large.bin")));
  const acceptedChooser = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: "Attach file…" }).click();
  await (await acceptedChooser).setFiles(large);
  await warning.getByRole("button", { name: "Attach files" }).click();
  await waitFile(join(before.workspace, "attachments", "large.bin"));
  assert.equal(
    (await readFile(join(before.workspace, "attachments", "large.bin"))).length,
    21 * 1024 * 1024,
  );

  await page.getByRole("button", { name: "Stop", exact: true }).click();
  await page
    .locator(".agent-status")
    .filter({ hasText: /Exited|Stopped/ })
    .waitFor();
  const saved = join(root, "attached.freac");
  await saveDocument(page, saved);
  await app.evaluate(({ dialog }) => {
    dialog.showMessageBox = async (options) => ({
      response: options.buttons?.length === 2 ? 0 : 2,
    });
  });
  await app.evaluate(({ dialog }, path) => {
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [path] });
  }, saved);
  await app.evaluate(({ Menu }) => {
    Menu.getApplicationMenu()
      .items.find((item) => item.label === "File")
      .submenu.items.find((item) => item.label === "Open…")
      .click();
  });
  await page.waitForFunction(async (previous) => {
    const state = await window.freacAgent.request({ kind: "read" });
    return state.workspace && state.workspace !== previous;
  }, before.workspace);
  const after = await page.evaluate(() => window.freacAgent.request({ kind: "read" }));
  assert.deepEqual(
    await readFile(join(after.workspace, "attachments", "photo one (2).png")),
    Buffer.from("dropped bytes"),
  );
  assert.equal((await page.evaluate(() => window.freacDocument.status())).edited, false);
  assert.equal((await page.evaluate(() => window.freacInspect())).document.bodies?.length ?? 0, 0);
  console.log(
    "PASS file chooser, drop, terminal cursor path, collision, size warning, save/reopen",
  );
} finally {
  const forceClose = setTimeout(() => app.process().kill("SIGKILL"), 3000);
  await app.evaluate(({ dialog }) => {
    dialog.showMessageBox = async (options) => ({
      response: options.buttons?.length === 2 ? 0 : 2,
    });
  });
  await app.close();
  clearTimeout(forceClose);
  await rm(root, { recursive: true, force: true });
}

async function waitFile(path) {
  for (let attempt = 0; attempt < 200; attempt++) {
    try {
      await access(path);
      return;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
  }
  throw new Error(`File was not created: ${path}`);
}
