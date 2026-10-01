import { bodyArchiveRoute } from "./ui-body-archive.mjs";
import { makePlate } from "./ui-face-offset.mjs";
import { circleLinkRoute, pointLinkRoute } from "./ui-point-links.mjs";
import { rectangleRoute } from "./ui-rectangle.mjs";
import { relationRoute } from "./ui-relations.mjs";
import { withUiRuntimes } from "./ui-runtime.mjs";
import { typedSelectionRoute } from "./ui-typed-selection.mjs";

await withUiRuntimes(
  async (page, name) => {
    await rectangleRoute(page, name);
    await relationRoute(page, name);
    await typedSelectionRoute(page, name);
    await pointLinkRoute(page, name);
    await circleLinkRoute(page, name);
    await makePlate(page);
    await bodyArchiveRoute(page, `${name}-foundation`);
    console.log(
      `${name}: shared creation, constraints, typed points, Fuse/Unfuse, movement, history and archive pass`,
    );
  },
  { timeout: 30000 },
);
