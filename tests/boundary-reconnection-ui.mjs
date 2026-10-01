import { roundReconnection, singleEdgeReconnection } from "./ui-boundary-reconnection.mjs";
import { featureReconnection } from "./ui-reconnection-features.mjs";

import { withUiRuntimes } from "./ui-runtime.mjs";

await withUiRuntimes(
  async (page, name) => {
    await roundReconnection(page, name, name === "electron");
    await singleEdgeReconnection(page, name, name === "electron");
    for (const kind of ["hole", "pocket", "boss"])
      await featureReconnection(page, name, name === "electron", kind);
  },
  { defaults: ["chromium"], timeout: 15000 },
);
