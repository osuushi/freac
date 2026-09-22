/** Invoke through the real searchable tool UI, never a controller or hidden button. */
export async function chooseTool(page, query, id) {
  await openTools(page);
  await page.getByRole("combobox", { name: "Find a tool" }).fill(query);
  const row = page.locator(`[data-command="${id}"]`);
  // Locator actionability waits through transient tool closure/calculation updates.
  await row.click();
  await page.waitForFunction(() => !window.freacInspect().busy);
}

export async function browseTools(page, category) {
  await openTools(page);
  await page.getByRole("combobox", { name: "Find a tool" }).fill("");
  const back = page.locator(".tool-menu-back");
  if (await back.isVisible()) await back.click();
  await page.getByRole("option", { name: category, exact: true }).click();
}

export async function toolEnabled(page, query, id) {
  await openTools(page);
  await page.getByRole("combobox", { name: "Find a tool" }).fill(query);
  const enabled =
    (await page.locator(`[data-command="${id}"]`).getAttribute("aria-disabled")) === "false";
  await page.keyboard.press("Escape");
  return enabled;
}

async function openTools(page) {
  if (await page.locator(".agent-dock:focus-within").count())
    await page.getByRole("button", { name: "Tools", exact: true }).click();
  else await page.keyboard.press("Meta+f");
}
