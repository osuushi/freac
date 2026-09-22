/** Re-evaluate a captured geometry gesture when its modifier changes at rest. */
export function replayPointerModifiers(
  signal: AbortSignal,
  active: () => boolean,
  move: (event: PointerEvent) => void,
): void {
  let last: PointerEvent | null = null;
  const options = { signal, capture: true };
  const remember = (event: PointerEvent) => {
    last = event;
  };
  window.addEventListener("pointerdown", remember, options);
  window.addEventListener("pointermove", remember, options);
  const update = (event: KeyboardEvent) => {
    if (!last || !active() || !["Shift", "Alt"].includes(event.key)) return;
    move(
      new PointerEvent("pointermove", {
        pointerId: last.pointerId,
        clientX: last.clientX,
        clientY: last.clientY,
        shiftKey: event.shiftKey,
        altKey: event.altKey,
        metaKey: event.metaKey,
        ctrlKey: event.ctrlKey,
      }),
    );
  };
  window.addEventListener("keydown", update, { signal });
  window.addEventListener("keyup", update, { signal });
}
