import type { Terminal } from "ghostty-web";

/** Canvas terminal history has no native scroll surface for finger gestures. */
export function terminalTouch(element: HTMLElement, terminal: Terminal): () => void {
  const controller = new AbortController();
  const options = { capture: true, passive: false, signal: controller.signal };
  let previousY: number | null = null;
  let startY = 0;
  let dragged = false;
  element.addEventListener(
    "touchstart",
    (event) => {
      previousY = event.touches.length === 1 ? event.touches[0].clientY : null;
      startY = previousY ?? 0;
      dragged = event.touches.length !== 1;
    },
    options,
  );
  element.addEventListener(
    "touchmove",
    (event) => {
      if (previousY === null || event.touches.length !== 1) {
        previousY = null;
        dragged = true;
        return;
      }
      const y = event.touches[0].clientY;
      if (!dragged && Math.abs(y - startY) < 6) return;
      dragged = true;
      event.preventDefault();
      event.stopPropagation();
      const canvas = element.querySelector("canvas");
      const lineHeight = (canvas?.getBoundingClientRect().height ?? 0) / terminal.rows;
      if (lineHeight > 0) terminal.scrollLines((previousY - y) / lineHeight);
      previousY = y;
    },
    options,
  );
  const end = (event: TouchEvent) => {
    // Ghostty focuses its hidden input on touchend. A swipe must not open the
    // keyboard or let Safari pan the page to that input.
    if (dragged) {
      event.preventDefault();
      event.stopPropagation();
    }
    previousY = null;
  };
  element.addEventListener("touchend", end, options);
  element.addEventListener("touchcancel", end, options);
  return () => controller.abort();
}
