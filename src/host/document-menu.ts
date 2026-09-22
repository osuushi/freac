import { Menu } from "electron";
import type { DocumentCommand } from "../model/document-host.js";

export function installDocumentMenu(dispatch: (command: DocumentCommand) => void): void {
  const item = (label: string, accelerator: string, command: DocumentCommand) => ({
    label,
    accelerator,
    click: () => dispatch(command),
  });
  Menu.setApplicationMenu(
    Menu.buildFromTemplate([
      ...(process.platform === "darwin" ? [{ role: "appMenu" as const }] : []),
      {
        label: "File",
        submenu: [
          item("New", "CmdOrCtrl+N", "new"),
          item("Open…", "CmdOrCtrl+O", "open"),
          { type: "separator" },
          item("Save", "CmdOrCtrl+S", "save"),
          item("Save As…", "CmdOrCtrl+Shift+S", "save-as"),
          { type: "separator" },
          item("Close", "CmdOrCtrl+W", "close"),
          ...(process.platform !== "darwin" ? [{ role: "quit" as const }] : []),
        ],
      },
      {
        label: "Edit",
        submenu: [
          item("Undo", "CmdOrCtrl+Z", "undo"),
          item("Redo", "CmdOrCtrl+Shift+Z", "redo"),
          { type: "separator" },
          { role: "cut" },
          { role: "copy" },
          { role: "paste" },
          { role: "selectAll" },
        ],
      },
      { role: "viewMenu" },
      { role: "windowMenu" },
    ]),
  );
}
