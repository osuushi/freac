import { cameraRoute } from "./ui-camera.mjs";
import { redrawRoute } from "./ui-camera-redraw.mjs";
import { trackballRoute } from "./ui-camera-trackball.mjs";
import { orbitPivotRoute, surfacePivotRoute } from "./ui-orbit-pivot.mjs";
import { orientationCubeRoute } from "./ui-orientation-cube.mjs";
import { bevelViewsRoute } from "./ui-orientation-cube-bevels.mjs";
import { planeTargetsRoute } from "./ui-plane-targets.mjs";
import { rollCenterRoute } from "./ui-roll-center.mjs";
import { withUiRuntimes } from "./ui-runtime.mjs";
import { trackpadSnapRoute } from "./ui-trackpad-snap.mjs";

await withUiRuntimes(
  async (page, name) => {
    await orbitPivotRoute(page, name);
    await surfacePivotRoute(page, name);
    await orientationCubeRoute(page, name);
    await bevelViewsRoute(page, name);
    await cameraRoute(page, name);
    await trackballRoute(page, name);
    await trackpadSnapRoute(page, name);
    await rollCenterRoute(page, name);
    await planeTargetsRoute(page, name);
    await redrawRoute(page, name);
  },
  { defaults: ["chromium"], timeout: 15000 },
);
