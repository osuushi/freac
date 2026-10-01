import { edgeMoveRoute } from "./ui-edge-move.mjs";
import { faceMoveRoute } from "./ui-face-move.mjs";

import { withUiRuntimes } from "./ui-runtime.mjs";

await withUiRuntimes(
  async (page, name) => {
    await edgeMoveRoute(page, name, name === "electron", true);
    await edgeMoveRoute(page, name, name === "electron", false);
    await faceMoveRoute(page, name, name === "electron");
  },
  { defaults: ["chromium"], timeout: 15000 },
);
