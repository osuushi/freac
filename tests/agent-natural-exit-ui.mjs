import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readPortableArchive } from "../.build/host/model/portable-archive.js";
import { launchElectron, saveDocument } from "./native-documents.mjs";
import { drag, settled } from "./ui-helpers.mjs";
import { chooseTool } from "./ui-tools.mjs";

const root = await mkdtemp(join(tmpdir(), "makeshift-natural-exit-"));
const incoming = join(root, "Incoming.makeshift");
await writeFile(
  incoming,
  JSON.stringify({ format: "makeshift", version: 1, document: { units: "mm", sketches: [] } }),
);
async function startWriter(page, file) {
  await settled(page);
  await chooseTool(page, "Sketch on XY", "sketch-xy");
  await page.keyboard.press("l");
  await drag(page, [0, 0], [10, 8]);
  await page.keyboard.press("Escape");
  await saveDocument(page, file);
  await page.evaluate(() =>
    window.makeshiftAgent.request({
      kind: "configure",
      preferences: { preset: "custom", executable: "/bin/sh", args: ["-i"], env: {} },
    }),
  );
  await page.getByRole("button", { name: "Open agent terminal", exact: true }).click();
  await page.locator(".agent-status").filter({ hasText: "Running" }).waitFor();
  const workspace = (await page.evaluate(() => window.makeshiftAgent.request({ kind: "read" })))
    .workspace;
  await page.locator(".agent-screen textarea").focus();
  await page.keyboard.type(
    "trap '' HUP; (trap '' HUP TERM; while :; do echo tick >> writer.log; sleep .02; done) >/dev/null 2>&1 & echo $! > child.pid; sleep .2; exit",
  );
  await page.keyboard.press("Enter");
  await page.locator(".agent-status").filter({ hasText: "Exited 0" }).waitFor();
  const child = Number(await readFile(join(workspace, "child.pid"), "utf8"));
  const stopped = await readFile(join(workspace, "writer.log"));
  return { workspace, child, stopped };
}
async function run(command) {
  const file = join(root, `${command}.makeshift`);
  const app = await launchElectron({
    args: ["."],
    env: { ...process.env, MAKESHIFT_TEST_HIDDEN: "1", MAKESHIFT_DEV_URL: "" },
  });
  try {
    const page = await app.firstWindow();
    page.setDefaultTimeout(15000);
    const { workspace, child, stopped } = await startWriter(page, file);
    await app.evaluate(({ dialog }, incoming) => {
      dialog.showMessageBox = async () => ({ response: 0 });
      dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [incoming] });
    }, incoming);
    const closed = command === "Close" ? page.waitForEvent("close") : null;
    await app.evaluate(
      ({ Menu }, command) =>
        Menu.getApplicationMenu()
          .items.find((item) => item.label === "File")
          .submenu.items.find((item) => item.label === command)
          .click(),
      command,
    );
    if (closed) await closed;
    else {
      await page.waitForFunction(async () => {
        const status = await window.makeshiftDocument.status();
        return status.path === null || status.name === "Incoming.makeshift";
      });
      await settled(page);
    }
    const archive = readPortableArchive(await readFile(file));
    assert.deepEqual(
      Buffer.from(archive.files["workspace/writer.log"]),
      stopped,
      "Save includes all final writes",
    );
    assert.equal(archive.document.sketches[0].curves.length, 1);
    await new Promise((resolve) => setTimeout(resolve, 150));
    assert.deepEqual(
      await readFile(join(workspace, "writer.log")),
      stopped,
      "old workspace cannot keep changing after replacement",
    );
    assert.throws(
      () => process.kill(child, 0),
      (error) => error.code === "ESRCH",
    );
    console.log(
      `electron: natural Custom shell exit, resistant job cleanup and ${command} with Save preserve final workspace bytes`,
    );
  } finally {
    await app.evaluate(({ app }) => app.exit()).catch(() => {});
    await app.close();
  }
}
try {
  for (const command of ["New", "Open…", "Close"]) await run(command);
} finally {
  await rm(root, { recursive: true, force: true });
}
