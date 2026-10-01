import { bodyChamferRoute } from "./ui-body-chamfer.mjs";
import { bodyFilletRoute } from "./ui-body-fillet.mjs";
import { withUiRuntimes } from "./ui-runtime.mjs";

await withUiRuntimes(
  async (page, name) => {
    await bodyFilletRoute(page, name);
    await bodyChamferRoute(page, name);
  },
  { timeout: 30000 },
);
