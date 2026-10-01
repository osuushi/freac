import { canonicalPlanesRoute } from "./ui-canonical-planes.mjs";
import { planeTargetsRoute } from "./ui-plane-targets.mjs";
import { withUiRuntimes } from "./ui-runtime.mjs";

await withUiRuntimes(
  async (page, name) => {
    await planeTargetsRoute(page, name);
    await canonicalPlanesRoute(page, name);
  },
  { defaults: ["chromium", "webkit"] },
);
