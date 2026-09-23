import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { app, autoUpdater, dialog } from "electron";

/** Only signed release packages carry the feed configuration. */
export class AppUpdates {
  private enabled = false;
  private checking = false;
  private manual = false;
  private downloaded = false;
  private prompting = false;
  private release = "";
  private installing = false;

  constructor(
    private restart: () => void,
    private installFailed: () => void,
  ) {
    autoUpdater.on("error", (error) => this.failed(error));
    autoUpdater.on("update-not-available", () => {
      this.checking = false;
      if (this.manual) void this.message("Freac is up to date.");
      this.manual = false;
    });
    autoUpdater.on("update-downloaded", (_event, _notes, name) => {
      this.checking = false;
      this.manual = false;
      this.downloaded = true;
      this.release = name;
      void this.offerRestart();
    });
  }

  async start(): Promise<void> {
    if (!app.isPackaged || process.platform !== "darwin" || process.arch !== "arm64") return;
    const configuration = await readFile(join(process.resourcesPath, "updates.json"), "utf8").catch(
      () => null,
    );
    if (!configuration) return;
    try {
      const { url } = JSON.parse(configuration);
      if (typeof url !== "string" || new URL(url).protocol !== "https:")
        throw new Error("Invalid update feed");
      autoUpdater.setFeedURL({ url, serverType: "json" });
      this.enabled = true;
      if (process.env.FREAC_TEST_HIDDEN === "1") return;
      const initial = setTimeout(() => this.check(false), 30_000);
      const periodic = setInterval(() => this.check(false), 6 * 60 * 60 * 1000);
      initial.unref();
      periodic.unref();
      app.once("will-quit", () => {
        clearTimeout(initial);
        clearInterval(periodic);
      });
    } catch (error) {
      this.failed(error);
    }
  }

  check(manual = true): void {
    if (this.downloaded) {
      if (manual) void this.offerRestart();
      return;
    }
    if (!this.enabled) {
      if (manual) void this.message("Updates are available in signed macOS release builds.");
      return;
    }
    if (this.checking) {
      if (manual) void this.message("Freac is checking for or downloading an update.");
      return;
    }
    this.manual = manual;
    this.checking = true;
    try {
      autoUpdater.checkForUpdates();
    } catch (error) {
      this.failed(error);
    }
  }

  install(): void {
    if (!this.downloaded) throw new Error("No downloaded update is ready.");
    this.installing = true;
    try {
      autoUpdater.quitAndInstall();
    } catch (error) {
      this.failed(error);
      throw error;
    }
  }

  private failed(error: unknown): void {
    this.checking = false;
    console.error("Freac update failed:", error);
    if (this.installing) {
      this.installing = false;
      this.installFailed();
      void this.message(
        "Could not restart to update.",
        "Your drawing remains open. Try again later.",
      );
    } else if (this.manual)
      void this.message(
        "Could not check for updates.",
        "Check your connection and try again later.",
      );
    this.manual = false;
  }

  private async offerRestart(): Promise<void> {
    if (this.prompting) return;
    this.prompting = true;
    try {
      const result = await dialog.showMessageBox({
        type: "info",
        message: "A Freac update is ready.",
        detail: `${this.release}\nRestart now, or keep working and install when you next quit. The active operation will be completed before the usual unsaved-work prompt.`,
        buttons: ["Restart to update", "Later"],
        defaultId: 1,
        cancelId: 1,
      });
      if (result.response === 0) this.restart();
    } finally {
      this.prompting = false;
    }
  }

  private async message(message: string, detail?: string): Promise<void> {
    await dialog.showMessageBox({ type: "info", message, detail, buttons: ["OK"] });
  }
}
