import { arcRoute } from "./ui-arc.mjs";
import { bezierRoute } from "./ui-bezier.mjs";
import { bodyChamferRoute } from "./ui-body-chamfer.mjs";
import { bodyFilletRoute } from "./ui-body-fillet.mjs";
import { circleRoute } from "./ui-circle.mjs";
import { extrudeRoute } from "./ui-extrude.mjs";
import { faceOffsetRoute } from "./ui-face-offset.mjs";
import { lineRoute } from "./ui-line.mjs";
import { planeCutRoute } from "./ui-plane-cuts.mjs";
import { pointLinkRoute } from "./ui-point-links.mjs";
import { rectangleRoute } from "./ui-rectangle.mjs";
import { revolveRoute } from "./ui-revolve.mjs";
import { withUiRuntimes } from "./ui-runtime.mjs";
import { shellRoute } from "./ui-shell.mjs";
import { transformRoute } from "./ui-transform.mjs";
import { trimLineRoute } from "./ui-trim.mjs";

// A bounded ordinary-control gate; captured geometry and async interleavings
// stay in their dedicated suites. All routes use the real native owner path.
await withUiRuntimes(
  async (page, name) => {
    for (const route of [
      rectangleRoute,
      lineRoute,
      circleRoute,
      arcRoute,
      bezierRoute,
      pointLinkRoute,
      trimLineRoute,
      transformRoute,
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
  { timeout: 30000 },
);
