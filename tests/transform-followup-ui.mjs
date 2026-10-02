import { withUiRuntimes } from "./ui-runtime.mjs";
import { transformFollowupRoute } from "./ui-transform-followup.mjs";

await withUiRuntimes(
  async (page, name) => {
    try {
      await transformFollowupRoute(page, name);
    } catch (error) {
      console.log(
        await page.evaluate(() => ({
          interaction: window.makeshiftInspect().interaction,
          moveMode: window.makeshiftInspect().moveMode,
          status: document.querySelector("[role=status]")?.textContent,
        })),
      );
      throw error;
    }
  },
  { allowed: ["chromium", "webkit"] },
);
