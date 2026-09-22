import type { SketchEditor } from "../sketch/editor.js";
import { ConnectionScreen } from "./connection-screen.js";
import type { IPadStatus } from "./protocol.js";

export function installIPadButton(editor: SketchEditor, app: HTMLElement): void {
  const host = window.freacIPad;
  if (!host) return;
  const button = document.createElement("button");
  button.textContent = "iPad";
  button.className = "ipad-toggle";
  button.onclick = async () => {
    if (editor.blocked || editor.interactions.current || editor.isDragging) {
      editor.message = "Finish or cancel the current tool before connecting the iPad.";
      editor.refresh();
      return;
    }
    button.disabled = true;
    try {
      await host.start();
      location.reload();
    } catch (error) {
      editor.message = String(error);
      editor.refresh();
      button.disabled = false;
    }
  };
  app.querySelector("header")?.append(button);
}
export function showDesktopConnection(initial: IPadStatus): void {
  const host = window.freacIPad;
  if (!host) throw new Error("The computer host is unavailable");
  const screen = new ConnectionScreen("Freac on iPad", "Return to computer");
  const qr = document.createElement("img");
  qr.alt = "Scan to open this document on iPad";
  const hint = document.createElement("p");
  hint.textContent = "Scan with your iPad camera on the same Wi-Fi network.";
  const addresses = document.createElement("div");
  addresses.className = "ipad-addresses";
  screen.status.before(qr);
  screen.action.before(hint, addresses);
  const update = (status: IPadStatus) => {
    qr.src = status.qr ?? "";
    screen.root.classList.toggle("connected", status.connected);
    screen.status.textContent = status.connected
      ? "iPad connected · This document is controlled from the browser"
      : "Waiting for iPad · Scan to connect or reconnect";
    addresses.replaceChildren();
    for (const url of status.urls) {
      const link = document.createElement("a");
      link.href = url;
      link.textContent = url.split("#")[0];
      link.target = "_blank";
      link.rel = "noreferrer";
      addresses.append(link);
    }
  };
  screen.action.onclick = async () => {
    screen.action.disabled = true;
    try {
      await host.stop();
      location.reload();
    } catch (error) {
      screen.status.textContent = String(error);
      screen.action.disabled = false;
    }
  };
  update(initial);
  host.onStatus(update);
}
