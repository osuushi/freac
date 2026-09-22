import { contextBridge, ipcRenderer } from "electron";
import type { InspectionView } from "./agent/inspection-protocol.js";
import type { AgentRequest } from "./agent/protocol.js";
import type { IPadStatus } from "./ipad/protocol.js";
import type { ModelRequest, ModelView } from "./sketch/model-api.js";

contextBridge.exposeInMainWorld("freacFixture", (snapshot: unknown) =>
  ipcRenderer.invoke("capture-fixture", snapshot),
);

contextBridge.exposeInMainWorld("freacIPad", {
  status: () => ipcRenderer.invoke("ipad-status"),
  start: () => ipcRenderer.invoke("ipad-start"),
  stop: () => ipcRenderer.invoke("ipad-stop"),
  onStatus: (callback: (status: IPadStatus) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, status: IPadStatus) => callback(status);
    ipcRenderer.on("ipad-status", listener);
    return () => ipcRenderer.removeListener("ipad-status", listener);
  },
});

contextBridge.exposeInMainWorld("freacScript", {
  cancel: () => ipcRenderer.invoke("agent-script-cancel"),
  onState: (callback: (state: { running: boolean; view: ModelView }) => void) => {
    const listener = (
      _event: Electron.IpcRendererEvent,
      state: { running: boolean; view: ModelView },
    ) => callback(state);
    ipcRenderer.on("agent-script-state", listener);
    return () => ipcRenderer.removeListener("agent-script-state", listener);
  },
});

contextBridge.exposeInMainWorld("freacInspection", {
  onRequest: (callback: (render: boolean, acquireScript?: boolean) => InspectionView) => {
    const listener = (
      _event: Electron.IpcRendererEvent,
      request: { id: string; render: boolean; acquireScript?: boolean },
    ) => {
      try {
        ipcRenderer.send("agent-inspection-reply", {
          id: request.id,
          view: callback(request.render, request.acquireScript),
        });
      } catch (error) {
        ipcRenderer.send("agent-inspection-reply", {
          id: request.id,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    };
    ipcRenderer.on("agent-inspection-read", listener);
    return () => ipcRenderer.removeListener("agent-inspection-read", listener);
  },
});

contextBridge.exposeInMainWorld("freacAgent", {
  request: (request: AgentRequest) => ipcRenderer.invoke("agent", request),
});

contextBridge.exposeInMainWorld("freacModel", (request: ModelRequest) =>
  ipcRenderer.invoke("sketch", request),
);

contextBridge.exposeInMainWorld("freacDocument", {
  command: (command: string) => ipcRenderer.invoke("document-command", command),
  status: () => ipcRenderer.invoke("document-status"),
  onCommand: (callback: (command: string) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, command: string) => callback(command);
    ipcRenderer.on("document-command", listener);
    return () => ipcRenderer.removeListener("document-command", listener);
  },
  onStatus: (callback: (status: unknown) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, status: unknown) => callback(status);
    ipcRenderer.on("document-status", listener);
    return () => ipcRenderer.removeListener("document-status", listener);
  },
});
