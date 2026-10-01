import { withUiRuntimes } from "./ui-runtime.mjs";
import { cutawayRoute } from "./ui-sketch-cutaway.mjs";

await withUiRuntimes(
  async (page, name) => {
    for (const plane of ["XY", "XZ", "YZ"]) await cutawayRoute(page, name, plane);
  },
  { defaults: ["chromium"], timeout: 15000 },
);
