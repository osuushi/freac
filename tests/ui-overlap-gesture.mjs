export async function hold(page, point) {
  await page.mouse.move(point.x, point.y);
  await page.mouse.down();
  await page.waitForTimeout(360);
}
export async function releaseChoice(page, label) {
  await page
    .getByRole("dialog", { name: "Choose overlapping geometry" })
    .getByRole("button", { name: label, exact: true })
    .hover();
  await page.mouse.up();
}
