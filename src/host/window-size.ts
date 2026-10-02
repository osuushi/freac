import { readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { app, type BrowserWindow, screen } from "electron";

function preferencePath(): string {
  return join(app.getPath("userData"), "window-size.json");
}

export function restoreWindowSize(): { width: number; height: number } {
  let width = 1280;
  let height = 850;
  try {
    const saved = JSON.parse(readFileSync(preferencePath(), "utf8"));
    if (
      Number.isSafeInteger(saved?.width) &&
      saved.width > 0 &&
      Number.isSafeInteger(saved?.height) &&
      saved.height > 0
    ) {
      width = saved.width;
      height = saved.height;
    }
  } catch {
    // Missing or damaged preferences must not prevent launch.
  }
  const available = screen.getPrimaryDisplay().workAreaSize;
  return {
    width: Math.min(width, available.width),
    height: Math.min(height, available.height),
  };
}

export function rememberWindowSize(window: BrowserWindow): void {
  window.on("close", () => {
    // A screen-filling (zoomed/maximized) window should reopen at its displayed
    // size, not the smaller restore bounds retained by the window manager.
    const { width, height } =
      window.isFullScreen() || window.isMinimized() ? window.getNormalBounds() : window.getBounds();
    const path = preferencePath();
    try {
      // Finish this tiny preference write before the last window can quit the app.
      writeFileSync(`${path}.tmp`, JSON.stringify({ width, height }));
      renameSync(`${path}.tmp`, path);
    } catch (error) {
      console.error("Could not remember window size", error);
    }
  });
}
