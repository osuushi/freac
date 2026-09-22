import { toolMenuOpen } from "../tools/menu-focus.js";
/** CAD shortcuts must not intercept keys before they reach the embedded agent. */
export function onModelKeydown(
  handler: (event: KeyboardEvent) => void,
  options?: AddEventListenerOptions,
): void {
  window.addEventListener(
    "keydown",
    (event) => {
      if (event.target instanceof Element && event.target.closest(".agent-dock")) return;
      if (
        toolMenuOpen() ||
        ((event.metaKey || event.ctrlKey) && !event.altKey && event.key.toLowerCase() === "f")
      )
        return;
      handler(event);
    },
    options,
  );
}
