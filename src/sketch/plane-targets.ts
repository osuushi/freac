import * as THREE from "three";
import {
  createPlaneTargets,
  disposePlaneTarget,
  type PlaneTarget,
  planeTargetBaseColor,
  projectedTargetCorners,
} from "./plane-target-mesh.js";
import { type PlaneId, type Point, worldPoint } from "./planes.js";
import type { World } from "./world.js";

const buttonAnchor: Record<PlaneId, Point> = {
  XY: { x: 13.5, y: 13.5 },
  XZ: { x: -13.5, y: 13.5 },
  YZ: { x: -13.5, y: -13.5 },
};

export function installPlaneTargets(
  world: World,
  overlay: HTMLElement,
  occupied: (point: Point) => boolean,
): () => void {
  const targets = createPlaneTargets(world, overlay),
    interaction = new PlaneTargetInteraction(world, targets, occupied);
  world.changed.add(interaction.update);
  interaction.update();
  return () => {
    world.changed.delete(interaction.update);
    interaction.dispose();
    for (const target of targets) disposePlaneTarget(world, target);
  };
}

class PlaneTargetInteraction {
  private raycaster = new THREE.Raycaster();
  private abort = new AbortController();
  private hovered: PlaneTarget | null = null;
  private lastPointer: Point | null = null;
  private coverageTimer: ReturnType<typeof setTimeout> | undefined;

  constructor(
    private world: World,
    private targets: PlaneTarget[],
    private occupied: (point: Point) => boolean,
  ) {
    world.canvas.addEventListener("pointermove", this.pointerMove, {
      signal: this.abort.signal,
      capture: true,
    });
    world.canvas.addEventListener("pointerleave", this.pointerLeave, {
      signal: this.abort.signal,
    });
    world.canvas.addEventListener("click", this.canvasClick, {
      signal: this.abort.signal,
      capture: true,
    });
    for (const target of targets) {
      target.button.addEventListener("pointermove", () => this.setHovered(target), {
        signal: this.abort.signal,
      });
      target.button.addEventListener("pointerleave", this.pointerLeave, {
        signal: this.abort.signal,
      });
      target.button.addEventListener("focus", () => this.setHovered(target), {
        signal: this.abort.signal,
      });
      target.button.addEventListener("blur", this.pointerLeave, { signal: this.abort.signal });
      target.button.addEventListener("click", () => this.activate(target), {
        signal: this.abort.signal,
      });
    }
  }

  update = (): void => {
    const rect = this.world.canvas.getBoundingClientRect();
    layoutTargets(this.world, this.targets, rect);
    for (const target of this.targets) paint(target, this.hovered === target);
    if (this.world.active || (this.hovered && !this.available(this.hovered))) this.setHovered(null);
    clearTimeout(this.coverageTimer);
    // Coverage picking scans the model. Do it only after navigation settles,
    // never once per plane per camera frame. Canvas clicks still check coverage.
    if (!this.world.active) this.coverageTimer = setTimeout(this.refresh, 100);
  };

  dispose(): void {
    clearTimeout(this.coverageTimer);
    this.abort.abort();
  }

  private pointerMove = (event: PointerEvent): void => {
    if (this.world.planePickerAccept) {
      this.setHovered(null);
      return;
    }
    if (event.buttons) return;
    this.lastPointer = { x: event.clientX, y: event.clientY };
    const target = this.hitAt(this.lastPointer);
    if (target) event.stopImmediatePropagation();
    this.setHovered(target);
  };

  private pointerLeave = (): void => this.setHovered(null);

  private canvasClick = (event: MouseEvent): void => {
    // Cut references share one depth-aware picker with saved planes and faces.
    if (event.button !== 0 || event.metaKey || event.ctrlKey || this.world.planePickerAccept)
      return;
    const target = this.hitAt({ x: event.clientX, y: event.clientY });
    if (!target) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    this.activate(target);
  };

  private refresh = (): void => {
    for (const target of this.targets) {
      const screen = this.world.project(worldPoint(target.frame, buttonAnchor[target.id]));
      target.button.style.pointerEvents =
        this.available(target) && !this.occupied(screen) ? "auto" : "none";
    }
    if (this.lastPointer) this.setHovered(this.hitAt(this.lastPointer));
  };

  private hitAt(point: Point): PlaneTarget | null {
    const available = this.targets.filter((target) => this.available(target));
    if (!available.length) return null;
    const rect = this.world.canvas.getBoundingClientRect();
    this.raycaster.setFromCamera(
      new THREE.Vector2(
        ((point.x - rect.left) / rect.width) * 2 - 1,
        1 - ((point.y - rect.top) / rect.height) * 2,
      ),
      this.world.camera,
    );
    const hit = this.raycaster.intersectObjects(
      available.map((target) => target.hitMesh),
      false,
    )[0]?.object;
    if (!hit || this.occupied(point)) return null;
    return available.find((target) => target.hitMesh === hit) ?? null;
  }

  private available(target: PlaneTarget): boolean {
    return target.group.visible && !target.button.disabled && !target.button.hidden;
  }

  private setHovered(target: PlaneTarget | null): void {
    if (this.world.planePickerAccept) target = null;
    if (this.hovered === target) return;
    for (const candidate of this.targets) paint(candidate, candidate === target);
    this.hovered = target;
    this.world.renderer.render(this.world.scene, this.world.camera);
  }

  private activate(target: PlaneTarget): void {
    if (this.world.planePicker && this.world.canNavigate()) {
      this.world.planePicker(target.id);
      return;
    }
    if (!this.world.canEnterSketch()) return;
    if (this.world.sketchEntry) this.world.sketchEntry(target.id);
    else this.world.enter(target.id);
  }
}

function layoutTargets(world: World, targets: PlaneTarget[], rect: DOMRect): void {
  const visible = world.active === null;
  for (const target of targets) {
    const enabled = world.planePicker ? world.canNavigate() : world.canEnterSketch();
    const allowed = !world.planePickerAccept || world.planePickerAccept(target.frame);
    target.group.visible = visible && allowed;
    target.button.hidden = !visible || !allowed;
    target.button.disabled = !enabled;
    target.button.setAttribute(
      "aria-label",
      world.planePicker ? `${world.planePickerLabel} ${target.id}` : `Sketch on ${target.id}`,
    );
    target.button.title = world.planePicker
      ? `${world.planePickerLabel} ${target.id}`
      : `Sketch on ${target.id}`;
    if (!visible) continue;
    const corners = projectedTargetCorners(world, target),
      screen = world.project(worldPoint(target.frame, buttonAnchor[target.id]));
    target.button.style.left = `${screen.x - rect.left}px`;
    target.button.style.top = `${screen.y - rect.top}px`;
    target.button.style.pointerEvents = "none";
    target.button.dataset.projectedPolygon = JSON.stringify(corners);
  }
}

function paint(target: PlaneTarget, active: boolean): void {
  target.mesh.material.color.set(active ? "#83b9ee" : planeTargetBaseColor(target.id));
  target.mesh.material.opacity = (target.button.disabled ? 0.16 : active ? 0.62 : 0.32) * 0.7;
  target.button.dataset.hovered = String(active);
}
