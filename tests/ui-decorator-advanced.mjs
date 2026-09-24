export async function openThreadAdvanced(page) {
  const advanced = page.locator("details.thread-advanced");
  if (!(await advanced.evaluate((element) => element.open)))
    await advanced.locator("summary").click();
}
