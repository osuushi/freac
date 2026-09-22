import "./style.css";
import "../ipad/style.css";
import { connectBrowser } from "../ipad/browser-host.js";
import { showDesktopConnection } from "../ipad/desktop.js";
import { installEscapeAlias } from "./escape-key.js";

async function start(): Promise<void> {
  installEscapeAlias();
  const status = await window.freacIPad?.status();
  if (status?.active) {
    showDesktopConnection(status);
    return;
  }
  if (!window.freacModel && (location.hash || sessionStorage.getItem("freac-pairing")))
    await connectBrowser();
  await import("./main.js");
}
void start().catch(console.error);
