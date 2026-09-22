import { panCamera, zoomCamera } from "./camera-motion.js";
import type { World } from "./world.js";

// Chromium/Electron report trackpad pinch as ctrl+wheel. WebKit also exposes
// gesture scale events; while those are active they exclusively own pinch zoom.
export function installTrackpad(world: World, signal: AbortSignal): void {
  const canvas = world.canvas;
  const options = { signal, passive: false, capture: true };
  let scale: number | null = null;
  let pointer: { x: number; y: number } | null = null;
  for (const surface of [canvas, world.overlay])
    surface.addEventListener(
      "pointermove",
      (event) => {
        pointer = { x: event.clientX, y: event.clientY };
      },
      { signal },
    );
  const zoom = (factor: number, x: number, y: number) => {
    const bounds = canvas.getBoundingClientRect();
    if (!Number.isFinite(x)) x = pointer?.x ?? bounds.left + bounds.width / 2;
    if (!Number.isFinite(y)) y = pointer?.y ?? bounds.top + bounds.height / 2;
    zoomCamera(
      world,
      factor,
      { x: x - bounds.left - bounds.width / 2, y: y - bounds.top - bounds.height / 2 },
      bounds.height,
    );
    world.requestDraw();
  };
  installWheel(world, canvas, [canvas, world.overlay], () => scale !== null, zoom, options);
  installGestures(
    world,
    [canvas, world.overlay],
    () => scale,
    (value) => {
      scale = value;
    },
    zoom,
    options,
  );
}

function installGestures(
  world: World,
  surfaces: readonly HTMLElement[],
  getScale: () => number | null,
  setScale: (value: number | null) => void,
  zoom: (factor: number, x: number, y: number) => void,
  options: AddEventListenerOptions,
): void {
  for (const surface of surfaces)
    surface.addEventListener(
      "gesturestart",
      (event) => {
        event.preventDefault();
        if (world.canNavigate() && !world.orbit.active) {
          world.cancelCameraMotion();
          setScale(1);
        }
      },
      options,
    );
  for (const surface of surfaces)
    surface.addEventListener(
      "gesturechange",
      (event) => {
        event.preventDefault();
        const scale = getScale();
        if (scale === null || !world.canNavigate()) return;
        const gesture = event as Event & { scale: number; clientX: number; clientY: number };
        if (!Number.isFinite(gesture.scale) || gesture.scale <= 0) return;
        zoom(scale / gesture.scale, gesture.clientX, gesture.clientY);
        setScale(gesture.scale);
      },
      options,
    );
  const stop = (event: Event) => {
    if (event.cancelable) event.preventDefault();
    setScale(null);
  };
  for (const surface of surfaces) surface.addEventListener("gestureend", stop, options);
  window.addEventListener("blur", stop, { signal: options.signal });
}

function installWheel(
  world: World,
  canvas: HTMLCanvasElement,
  surfaces: readonly HTMLElement[],
  pinching: () => boolean,
  zoom: (factor: number, x: number, y: number) => void,
  options: AddEventListenerOptions,
): void {
  for (const surface of surfaces)
    surface.addEventListener(
      "wheel",
      (event) => {
        event.preventDefault();
        if (!world.canNavigate() || world.orbit.active || pinching()) return;
        world.cancelCameraMotion();
        const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? canvas.clientHeight : 1;
        if (event.ctrlKey) {
          zoom(Math.exp(event.deltaY * unit * 0.01), event.clientX, event.clientY);
        } else {
          if (!event.deltaX && !event.deltaY) return;
          panCamera(world, -event.deltaX * unit, -event.deltaY * unit, canvas.clientHeight);
          world.requestDraw();
        }
      },
      options,
    );
}
