import { chromium, webkit } from "playwright";
import { launchElectron } from "./native-documents.mjs";
import { fixtureRoute } from "./ui-fixture.mjs";
import { settled } from "./ui-helpers.mjs";

for (const [name, engine] of Object.entries({ chromium, webkit })) {
  const app = await launchElectron({
    args: ["."],
    env: { ...process.env, FREAC_TEST_HIDDEN: "1", FREAC_DEV_URL: "" },
  });
  let browser;
  try {
    const desktop = await app.firstWindow();
    await settled(desktop);
    await desktop.getByRole("button", { name: "iPad", exact: true }).click();
    const link = desktop.locator(".ipad-addresses a").first();
    await link.waitFor();
    browser = await engine.launch({ headless: true });
    const page = await browser.newPage({ viewport: { width: 1280, height: 850 } });
    await page.goto(await link.getAttribute("href"));
    await fixtureRoute(page, `ipad-${name}`);
  } finally {
    await browser?.close();
    await app.close();
  }
}
