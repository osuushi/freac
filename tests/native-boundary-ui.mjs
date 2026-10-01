import { faceOffsetRoute } from "./ui-face-offset.mjs";
import { measurementRoute } from "./ui-measurement.mjs";
import { withUiRuntimes } from "./ui-runtime.mjs";
import { shellRoute } from "./ui-shell.mjs";

await withUiRuntimes(
  async (page, name) => {
    await faceOffsetRoute(page, name, name === "electron");
    await measurementRoute(page, name);
    await shellRoute(page, name, name === "electron");
    console.log(
      `${name}: reduced native requests and validated replies preserve offset, queries, shell, history and archive routes`,
    );
  },
  { timeout: 20000 },
);
