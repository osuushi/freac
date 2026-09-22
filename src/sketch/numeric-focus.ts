/** Cycle the currently visible numeric controls, excluding hidden or disabled fields. */
export function focusNumericField(root: ParentNode, reverse = false): boolean {
  const fields = Array.from(
    root.querySelectorAll<HTMLInputElement>('input[inputmode="decimal"], input[type="number"]'),
  ).filter((field) => !field.disabled && !field.readOnly && field.getClientRects().length > 0);
  if (!fields.length) return false;
  const index =
    document.activeElement instanceof HTMLInputElement
      ? fields.indexOf(document.activeElement)
      : -1;
  const next =
    index < 0
      ? reverse
        ? fields.length - 1
        : 0
      : (index + (reverse ? -1 : 1) + fields.length) % fields.length;
  fields[next].focus();
  fields[next].select();
  return true;
}
