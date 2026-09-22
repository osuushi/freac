import test from "node:test";
import { cylindricalAxisFixture } from "./cylindrical-axis-fixture.js";

for (const partial of [false, true])
  test(`${partial ? "Partial" : "Full"} cylinder publishes the exact off-origin center axis`, async () => {
    await cylindricalAxisFixture(partial);
  });
