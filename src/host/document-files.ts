import { readFile, stat } from "node:fs/promises";
import { basename, dirname, isAbsolute, join } from "node:path";
import { app, type BrowserWindow } from "electron";
import type { DocumentOwner } from "../backend/document-owner.js";
import { validateDocument } from "../backend/open-document.js";
import { documentArchive } from "../model/document-archive.js";
import type { DocumentStatus } from "../model/document-host.js";
import { readPortableArchive, writePortableArchive } from "../model/portable-archive.js";
import type { AgentWorkspace } from "./agent-workspace.js";
import { safeWrite } from "./safe-write.js";
import { sessionDialogs as dialog } from "./session-dialogs.js";

export class DocumentFiles {
  path: string | null = null;
  private lastDirectory = app.getPath("documents");
  get directory(): string {
    return this.path ? dirname(this.path) : this.lastDirectory;
  }
  private saved: string;
  private cachedDocument: DocumentOwner["view"]["data"];
  private cachedArchive: string;
  private session = join(app.getPath("userData"), "document-session.json");
  constructor(
    private owner: DocumentOwner,
    private workspace: AgentWorkspace,
  ) {
    this.cachedDocument = owner.view.data;
    this.saved = this.cachedArchive = documentArchive(this.cachedDocument);
  }
  private get archive(): string {
    if (this.cachedDocument !== this.owner.view.data) {
      this.cachedDocument = this.owner.view.data;
      this.cachedArchive = documentArchive(this.cachedDocument);
    }
    return this.cachedArchive;
  }
  get status(): DocumentStatus {
    return {
      name: this.path ? basename(this.path) : "Untitled",
      path: this.path,
      edited: this.archive !== this.saved || this.workspace.dirty,
    };
  }
  async remember(): Promise<void> {
    // A preference failure must not turn a successful file save into a failed save.
    await safeWrite(
      this.session,
      JSON.stringify({ path: this.path, directory: this.directory }),
    ).catch(console.error);
  }
  async restore(): Promise<string | undefined> {
    await this.owner.call({ kind: "new" });
    this.workspace.adopt(null, {});
    this.path = null;
    this.saved = this.archive;
    let path: unknown;
    try {
      const preference = JSON.parse(await readFile(this.session, "utf8"));
      path = preference.path;
      if (typeof preference.directory === "string" && isAbsolute(preference.directory))
        this.lastDirectory = preference.directory;
      else if (typeof path === "string" && isAbsolute(path)) this.lastDirectory = dirname(path);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") return String(error);
      return;
    }
    if (typeof path !== "string") return;
    try {
      await this.open(path);
    } catch (error) {
      return `Could not reopen “${basename(path)}”. ${String(error)}`;
    }
  }

  async prepare(path: string) {
    if ((await stat(path)).size > 72 * 1024 * 1024) throw new Error("Document is too large.");
    const archive = readPortableArchive(await readFile(path));
    validateDocument(archive.document);
    const root = Object.keys(archive.files).length
      ? await this.workspace.prepare(archive.files)
      : null;
    return { path, ...archive, root };
  }
  async open(
    path: string,
    prepared?: Awaited<ReturnType<DocumentFiles["prepare"]>>,
  ): Promise<void> {
    const archive = prepared ?? (await this.prepare(path));
    const reply = await this.owner.call({
      kind: "open",
      document: archive.document,
    });
    if (reply.error) throw new Error(reply.error);
    this.workspace.adopt(archive.root, archive.files);
    this.path = path;
    this.lastDirectory = dirname(path);
    this.saved = this.archive;
    await this.remember();
  }
  async new(): Promise<void> {
    const reply = await this.owner.call({ kind: "new" });
    if (reply.error) throw new Error(reply.error);
    this.workspace.adopt(null, {});
    this.path = null;
    this.saved = this.archive;
    await this.remember();
  }
  async save(
    window: BrowserWindow,
    saveAs = false,
    beforeCapture?: () => Promise<void>,
  ): Promise<boolean> {
    let path = this.path;
    if (!path || saveAs) {
      const result = await dialog.showSaveDialog(window, {
        title: "Save Document",
        defaultPath: path ?? join(this.directory, "Untitled.freac"),
        filters: [{ name: "Freac Document", extensions: ["freac"] }],
      });
      if (result.canceled || !result.filePath) return false;
      path = result.filePath;
    }
    await beforeCapture?.();
    const archive = this.archive;
    const files = await this.workspace.snapshot();
    const bytes = writePortableArchive(archive, files);
    await safeWrite(path, bytes);
    this.path = path;
    this.lastDirectory = dirname(path);
    this.saved = archive;
    this.workspace.saved(files);
    await this.remember();
    return true;
  }
  async replacementChoice(window: BrowserWindow): Promise<"clean" | "save" | "discard" | "cancel"> {
    await this.workspace.refresh();
    if (!this.status.edited) return "clean";
    const { response } = await dialog.showMessageBox(window, {
      type: "warning",
      message: `Do you want to save the changes made to “${this.status.name}”?`,
      detail: "Your changes will be lost if you don’t save them.",
      buttons: ["Save", "Cancel", "Don’t Save"],
      defaultId: 0,
      cancelId: 1,
      noLink: true,
    });
    return response === 2 ? "discard" : response === 0 ? "save" : "cancel";
  }
}
