import { delayedBackend } from "./ui-backend.mjs";
import { calculationRoute } from "./ui-calculation.mjs";
import { shellCalculationRoute } from "./ui-calculation-shell.mjs";
import { cameraRoute } from "./ui-camera.mjs";
import { interactionLifecycleRoute } from "./ui-interaction-lifecycle.mjs";
import { withUiRuntimes } from "./ui-runtime.mjs";

await withUiRuntimes(async (page, name) => {
  await calculationRoute(page, name);
  await shellCalculationRoute(page, name);
  await cameraRoute(page, name);
  await interactionLifecycleRoute(page, name);
  if (name !== "electron") await delayedBackend(page, name);
});
