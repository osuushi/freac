import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { _electron } from "playwright";
import { chooseTool } from "./ui-tools.mjs";

const sessions = new WeakMap();
/** Existing geometry suites discard between cases; lifecycle tests answer prompts explicitly. */
export async function launchElectron(options) {
  const directory = await mkdtemp(join(tmpdir(), "freac-ui-"));
  let app;
  try {
    app = await _electron.launch({
      ...options,
      args: [...options.args, `--user-data-dir=${directory}`],
    });
    await app.evaluate(({ dialog }) => {
      dialog.showMessageBox = async () => ({ response: 2 });
    });
    const firstWindow = app.firstWindow.bind(app);
    app.firstWindow = async (...args) => {
      const page = await firstWindow(...args);
      sessions.set(page, { app, directory });
      return page;
    };
    const close = app.close.bind(app);
    app.close = async () => {
      try {
        await close();
      } finally {
        await rm(directory, { recursive: true, force: true });
      }
    };
    return app;
  } catch (error) {
    await app?.close();
    await rm(directory, { recursive: true, force: true });
    throw error;
  }
}

export async function openDocument(page, file) {
  const session = sessions.get(page);
  if (!session) {
    const chooser = page.waitForEvent("filechooser");
    await chooseTool(page, "open document", "open");
    return (await chooser).setFiles(file);
  }
  let path = file;
  if (typeof file !== "string") {
    path = join(session.directory, "fixture.freac");
    await writeFile(path, file.buffer);
  }
  await session.app.evaluate(({ dialog }, path) => {
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [path] });
  }, path);
  await chooseTool(page, "open document", "open");
  await page.waitForFunction(() => !window.freacInspect().busy);
}

export async function saveDocument(page, path) {
  const session = sessions.get(page);
  if (!session) {
    const downloaded = page.waitForEvent("download");
    await chooseTool(page, "save document", "save");
    await (await downloaded).saveAs(path);
    return;
  }
  await session.app.evaluate(({ dialog, Menu }, path) => {
    dialog.showSaveDialog = async () => ({ canceled: false, filePath: path });
    Menu.getApplicationMenu()
      .items.find((item) => item.label === "File")
      .submenu.items.find((item) => item.label === "Save As…")
      .click();
  }, path);
  for (let attempt = 0; attempt < 200; attempt++) {
    const saved = await page.evaluate(async (path) => {
      const status = await window.freacDocument.status();
      return status.path === path && !status.edited && !window.freacInspect().busy;
    }, path);
    if (saved) return;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error(`Save did not complete: ${path}`);
}

export async function exportDocument(page, format, path) {
  const session = sessions.get(page);
  const waiting = session
    ? session.app.evaluate(
        ({ BrowserWindow }, path) =>
          new Promise((resolve, reject) => {
            BrowserWindow.getAllWindows()[0].webContents.session.once(
              "will-download",
              (_, item) => {
                item.setSavePath(path);
                item.once("done", (_, state) =>
                  state === "completed" ? resolve(null) : reject(new Error(state)),
                );
              },
            );
          }),
        path,
      )
    : page.waitForEvent("download");
  await chooseTool(page, `export ${format}`, `export-${format}`);
  const download = await waiting;
  if (download) await download.saveAs(path);
}
