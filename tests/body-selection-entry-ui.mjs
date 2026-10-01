import { bodySelectionEntryRoute } from "./ui-body-selection-entry.mjs";

import { withUiRuntimes } from "./ui-runtime.mjs";

await withUiRuntimes(
  async (page, name) => {
    await bodySelectionEntryRoute(page, name);
  },
  { defaults: ["chromium"], timeout: 15000 },
);
