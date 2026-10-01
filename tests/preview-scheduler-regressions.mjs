import { extrudeRoute } from "./ui-extrude.mjs";
import { faceOffsetRoute } from "./ui-face-offset.mjs";
import { withUiRuntimes } from "./ui-runtime.mjs";

await withUiRuntimes(
  async (page, name) => {
    await extrudeRoute(page, name);
    await faceOffsetRoute(page, name, name === "electron");
    console.log(
      `${name}: ordinary Extrude/Offset controls, completion, limits, history, Save/Open and subsequent face sketches pass`,
    );
  },
  { timeout: 20000 },
);
