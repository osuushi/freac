import { cubeAlignment } from "./orientation-cube-alignment.js";
import { createOrientationCube } from "./orientation-cube-view.js";
import { pointerDragThreshold } from "./pointer-intent.js";
import type { World } from "./world.js";

type CubeView = ReturnType<typeof createOrientationCube>;
type Face = CubeView["entries"][number]["face"];

export function installOrientationCube(world: World): () => void {
  const view = createOrientationCube(world);
  const input = new CubeInput(world, view);
  world.changed.add(view.draw);
  view.draw();
  return () => {
    input.dispose();
    world.changed.delete(view.draw);
    view.cube.remove();
  };
}

class CubeInput {
  private abort = new AbortController();
  private press: { event: PointerEvent; bounds: DOMRect; dragging: boolean } | null = null;
  private suppressClick = false;

  constructor(
    private world: World,
    private view: CubeView,
  ) {
    const options = { signal: this.abort.signal };
    const cube = view.cube;
    cube.addEventListener("pointerdown", this.start, options);
    cube.addEventListener("pointermove", this.move, options);
    cube.addEventListener("pointerup", this.release, options);
    cube.addEventListener("pointercancel", this.stop, options);
    cube.addEventListener("lostpointercapture", this.stop, options);
    window.addEventListener("blur", this.stop, options);
    window.addEventListener(
      "keydown",
      (event) => {
        if (event.key === "Escape" && this.press) {
          event.preventDefault();
          event.stopImmediatePropagation();
          this.stop();
        }
      },
      { ...options, capture: true },
    );
    for (const { face, group } of view.entries) {
      group.addEventListener(
        "click",
        (event) => {
          event.stopPropagation();
          if (!this.suppressClick) this.align(face);
        },
        options,
      );
      group.addEventListener(
        "keydown",
        (event) => {
          if (event.key !== "Enter" && event.key !== " ") return;
          event.preventDefault();
          event.stopPropagation();
          this.align(face);
        },
        options,
      );
    }
  }
  private align(face: Face): void {
    const world = this.world;
    if (!world.canNavigate() || world.orbit.active) return;
    world.exit();
    const quaternion = cubeAlignment(face, world.camera.quaternion);
    world.animateOrientation(quaternion);
  }
  private start = (event: PointerEvent): void => {
    event.stopPropagation();
    this.suppressClick = true;
    if (event.button !== 0 || this.press || !this.world.canNavigate() || this.world.orbit.active)
      return;
    this.world.cancelCameraMotion();
    this.press = { event, bounds: this.view.cube.getBoundingClientRect(), dragging: false };
    this.view.cube.setPointerCapture(event.pointerId);
  };
  private move = (event: PointerEvent): void => {
    const press = this.press;
    if (!press || press.event.pointerId !== event.pointerId) return;
    const start = press.event;
    if (!press.dragging) {
      if (
        Math.hypot(event.clientX - start.clientX, event.clientY - start.clientY) <=
        pointerDragThreshold(start)
      )
        return;
      press.dragging = true;
      if (this.world.active) this.world.exit();
      this.world.orbit.begin(this.world, coordinates(start, press.bounds));
      this.view.cube.classList.add("dragging");
    }
    this.world.orbit.drag(this.world, coordinates(event, press.bounds));
    this.world.requestDraw();
  };
  private release = (event: PointerEvent): void => {
    const press = this.press;
    if (!press || press.event.pointerId !== event.pointerId) return;
    this.stop();
    if (press.dragging) this.world.levelHorizon();
    else {
      const entry = this.view.entries.find(({ group }) =>
        group.contains(press.event.target as Node),
      );
      if (entry) this.align(entry.face);
    }
  };
  private stop = (): void => {
    const previous = this.press;
    this.press = null;
    this.view.cube.classList.remove("dragging");
    if (!previous) return;
    this.suppressClick = true;
    if (previous.dragging) this.world.orbit.end();
    if (this.view.cube.hasPointerCapture(previous.event.pointerId))
      this.view.cube.releasePointerCapture(previous.event.pointerId);
    this.world.requestDraw();
  };
  dispose(): void {
    this.stop();
    this.abort.abort();
  }
}

function coordinates(event: PointerEvent, bounds: DOMRect) {
  return {
    x: (event.clientX - bounds.left - bounds.width / 2) / (bounds.width / 2),
    y: -(event.clientY - bounds.top - bounds.height / 2) / (bounds.height / 2),
  };
}
