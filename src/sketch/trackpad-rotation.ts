import { rollCamera } from "./camera-motion.js";
import type {} from "./navigation-host.js";
import type { TrackpadSnap } from "./trackpad-snap.js";
import type { World } from "./world.js";

/** Native trackpad rotation shares the pointer anchor used by pinch zoom. */
export function installTrackpadRotation(
  world: World,
  signal: AbortSignal,
  snap: TrackpadSnap,
): void {
  const host = window.makeshiftNavigation;
  if (!host) return;
  let rotating = false;
  let pointer: { x: number; y: number } | null = null;
  window.addEventListener(
    "pointermove",
    (event) => {
      pointer = { x: event.clientX, y: event.clientY };
    },
    { signal, capture: true },
  );
  const clear = () => {
    pointer = null;
    rotating = false;
    snap.cancel();
  };
  window.addEventListener("blur", clear, { signal });
  document.documentElement.addEventListener("pointerleave", clear, { signal });
  const remove = host.onRotate((degrees) => {
    if (degrees === 0) {
      if (rotating) snap.release();
      rotating = false;
      return;
    }
    if (
      !pointer ||
      !Number.isFinite(degrees) ||
      !degrees ||
      !world.canNavigate() ||
      world.orbit.active
    )
      return;
    const hit = document.elementFromPoint(pointer.x, pointer.y);
    if (
      !hit ||
      (hit !== world.canvas && !world.overlay.contains(hit)) ||
      hit.closest("button, input, select, textarea, [contenteditable]")
    )
      return;
    const bounds = world.canvas.getBoundingClientRect();
    rotating = true;
    snap.hold();
    world.cancelCameraMotion();
    rollCamera(
      world,
      (degrees * Math.PI) / 180,
      {
        x: pointer.x - bounds.left - bounds.width / 2,
        y: pointer.y - bounds.top - bounds.height / 2,
      },
      bounds.height,
    );
    world.requestDraw();
    snap.request();
  });
  signal.addEventListener("abort", remove, { once: true });
}
