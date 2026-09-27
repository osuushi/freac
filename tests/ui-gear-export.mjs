import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { chooseTool } from "./ui-tools.mjs";

export async function exportGear(page, name, app, format = "3mf") {
  const path = resolve(`.cache/sketch-review/${name}.${format}`);
  const waiting = app
    ? app.evaluate(
        ({ BrowserWindow }, destination) =>
          new Promise((resolve, reject) => {
            BrowserWindow.getAllWindows()[0].webContents.session.once(
              "will-download",
              (_, item) => {
                item.setSavePath(destination);
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
  assert.ok((await readFile(path)).length > 1000);
}
