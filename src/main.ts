import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { app, BrowserWindow, ipcMain } from "electron";
import { DocumentOwner } from "./backend/document-owner.js";
import { captureFixture } from "./backend/fixture-capture.js";
import { NativeSolver } from "./backend/native-solver.js";
import { AgentSession } from "./host/agent-session.js";
import { DocumentSession } from "./host/document-session.js";
import { IPadSession } from "./host/ipad-session.js";
import { nativeExecutable } from "./host/native-paths.js";
import type { ModelRequest } from "./sketch/model-api.js";

const directory = dirname(fileURLToPath(import.meta.url));
const icon = join(
  app.getAppPath(),
  app.isPackaged ? ".build/renderer" : "assets/public",
  "freac.png",
);
const owner = new DocumentOwner(
  new NativeSolver(nativeExecutable("solver")),
  nativeExecutable("kernel"),
);
let documents: DocumentSession;
let agent: AgentSession;
let ipad: IPadSession;
ipcMain.handle("capture-fixture", (event, snapshot: unknown) => {
  if (event.senderFrame !== event.sender.mainFrame || !BrowserWindow.fromWebContents(event.sender))
    throw new Error("Fixture capture requires the document window");
  documents.checkDesktop();
  return captureFixture(snapshot, app.isPackaged ? app.getPath("userData") : process.cwd());
});
ipcMain.handle("sketch", (event, request: ModelRequest) => {
  if (event.senderFrame !== event.sender.mainFrame) throw new Error("Main frame only");
  documents.checkDesktop();
  return documents.model(request);
});
app.on("will-quit", () => owner.close());
const hidden = process.env.FREAC_TEST_HIDDEN === "1";
let opening: Promise<void> | null = null;
let documentWindow: BrowserWindow | null = null;
function openWindow(): Promise<void> {
  const existing = documentWindow;
  if (existing) {
    if (!hidden) existing.show();
    return Promise.resolve();
  }
  if (!opening)
    opening = createWindow().finally(() => {
      opening = null;
    });
  return opening;
}
async function createWindow(): Promise<void> {
  await documents.reopen();
  const window = new BrowserWindow({
    title: "Freac",
    icon,
    width: 1280,
    height: 850,
    show: !hidden,
    backgroundColor: "#f8f9fb",
    webPreferences: {
      preload: join(directory, "preload.cjs"),
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      // Hidden acceptance windows should paint like foreground review windows.
      backgroundThrottling: !hidden,
    },
  });
  documentWindow = window;
  window.on("closed", () => {
    documentWindow = null;
  });
  documents.attach(window);
  agent.attach(window);
  ipad.attach(window);
  const url = process.env.FREAC_DEV_URL;
  if (url) await window.loadURL(url);
  else await window.loadFile(join(directory, "../renderer/index.html"));
}
app
  .whenReady()
  .then(async () => {
    if (process.platform === "darwin" && !app.isPackaged) app.dock?.setIcon(icon);
    if (hidden && process.platform === "darwin") app.dock?.hide();
    agent = new AgentSession();
    documents = new DocumentSession(owner, openWindow, agent);
    ipad = new IPadSession(join(directory, "../renderer"), documents, agent);
    await documents.restore();
    await openWindow();
    app.on("activate", () => {
      if (!documentWindow) void openWindow();
    });
  })
  .catch((error: unknown) => {
    console.error(error);
    app.exit(1);
  });
app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
