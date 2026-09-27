/** Choose signed offset explicitly now that eligible faces default to thickness. */
export async function relativeOffsetInput(page) {
  if (await page.getByRole("textbox", { name: "Face thickness", exact: true }).isVisible())
    await page.getByRole("button", { name: "Switch offset measurement", exact: true }).click();
  return page.getByRole("textbox", { name: "Face offset distance", exact: true });
}
