import { bodyFilletRoute } from "./ui-body-fillet.mjs";
import { faceOffsetRoute } from "./ui-face-offset.mjs";
import { hiddenBodiesRoute } from "./ui-hidden-bodies.mjs";
import { withUiRuntimes } from "./ui-runtime.mjs";
import { cutawayRoute } from "./ui-sketch-cutaway.mjs";

await withUiRuntimes(
  async (page, name) => {
    await bodyFilletRoute(page, name, name === "electron");
    await faceOffsetRoute(page, name, name === "electron");
    await hiddenBodiesRoute(page);
    await cutawayRoute(page, name);
    console.log(
      `${name}: retained drawables preserve solid previews, source-chain highlights, history, visibility and complementary clipping`,
    );
  },
  { timeout: 20000 },
);
