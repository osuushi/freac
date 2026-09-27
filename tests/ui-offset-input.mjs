/** Choose signed offset explicitly now that eligible faces default to thickness. */
export async function relativeOffsetInput(page) {
  const mode = page.getByRole("combobox", { name: "Offset mode", exact: true });
  if ((await mode.isVisible()) && (await mode.inputValue()) !== "offset")
    await mode.selectOption("offset");
  return page.getByRole("textbox", { name: "Face offset distance", exact: true });
}
