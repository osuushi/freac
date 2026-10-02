import assert from "node:assert/strict";
import { launchElectron } from "./native-documents.mjs";
import { settled } from "./ui-helpers.mjs";

const app = await launchElectron({
  args: ["."],
  env: { ...process.env, MAKESHIFT_TEST_HIDDEN: "1", MAKESHIFT_DEV_URL: "" },
});
try {
  const page = await app.firstWindow();
  await settled(page);
  await page.getByRole("button", { name: "Trackpad", exact: true }).click();
  await page.getByRole("radio", { name: "Mouse", exact: true }).check();
  await page.getByRole("button", { name: "Tablet", exact: true }).click();
  await page.getByRole("heading", { name: "Makeshift on iPad" }).waitFor();
  assert.ok(await page.locator(".ipad-addresses a").count());
  await page.getByRole("button", { name: "Return to computer", exact: true }).click();
  await settled(page);
  await page.getByRole("button", { name: "Mouse", exact: true }).click();
  assert.ok(await page.getByRole("radio", { name: "Mouse", exact: true }).isChecked());
  assert.equal(await page.getByRole("radio", { name: "Tablet", exact: true }).count(), 0);
  await page.screenshot({ path: "/tmp/makeshift-control-electron.png" });
  console.log("Hidden Electron: Tablet handoff/return preserves Mouse preference");
} finally {
  await app.close();
}
