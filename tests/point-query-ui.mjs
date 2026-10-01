import { bodyMultiselectRoute } from "./ui-body-multiselect.mjs";
import { modelFrustumSelectionRoute } from "./ui-model-frustum-selection.mjs";
import { moveFieldsRoute } from "./ui-move-fields.mjs";
import { pointChoiceRoute } from "./ui-point-choice.mjs";
import { pointEdgeRoute } from "./ui-point-edge.mjs";
import { circleLinkRoute, pointLinkRoute } from "./ui-point-links.mjs";
import { relationRoute } from "./ui-relations.mjs";
import { withUiRuntimes } from "./ui-runtime.mjs";
import { typedSelectionRoute } from "./ui-typed-selection.mjs";

await withUiRuntimes(
  async (page, name) => {
    await typedSelectionRoute(page, name);
    await pointChoiceRoute(page, name);
    await pointLinkRoute(page, name);
    await circleLinkRoute(page, name);
    await pointEdgeRoute(page, name);
    await relationRoute(page, name);
    await moveFieldsRoute(page, name);
    await bodyMultiselectRoute(page, name);
    await modelFrustumSelectionRoute(page, name);
    console.log(
      `${name}: point enumeration/chooser, ordered constraints, Transform bounds and modeling selection pass`,
    );
  },
  { timeout: 30000 },
);
