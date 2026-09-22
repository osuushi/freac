/** A menu temporarily borrows focus from a local numeric edit without accepting it. */
let open = false;
let borrowed: HTMLElement | null = null;
export function toolMenuOpen(): boolean {
  return open;
}
export function numericFocus(element: HTMLElement): boolean {
  return document.activeElement === element || (open && borrowed === element);
}
export function borrowToolFocus(): void {
  borrowed = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  open = true;
}
export function restoreToolFocus(): void {
  // Keep the guard through focus handlers so a numeric edit keeps its original value.
  if (borrowed?.isConnected) borrowed.focus({ preventScroll: true });
  open = false;
  borrowed = null;
}
