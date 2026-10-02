import { bodyChamferRoute } from "./ui-body-chamfer.mjs";
import { bodyFilletRoute } from "./ui-body-fillet.mjs";
import { extrudeRoute } from "./ui-extrude.mjs";
import { faceOffsetRoute } from "./ui-face-offset.mjs";
import { planeCutRoute } from "./ui-plane-cuts.mjs";
import { revolveRoute } from "./ui-revolve.mjs";
import { withUiRuntimes } from "./ui-runtime.mjs";
import { shellRoute } from "./ui-shell.mjs";

await withUiRuntimes(
  async (page, name) => {
    for (const route of [
      extrudeRoute,
      revolveRoute,
      faceOffsetRoute,
      bodyFilletRoute,
      bodyChamferRoute,
      shellRoute,
      planeCutRoute,
    ]) {
      console.log(`${name}: ${route.name}`);
      await route(page, name, name === "electron");
    }
  },
  { defaults: ["chromium"], timeout: 30000 },
);
