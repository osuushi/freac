export interface WidgetTarget {
  x: number;
  y: number;
  size: number;
}

function overlaps(a: WidgetTarget, b: WidgetTarget, gap: number): boolean {
  const clearance = (a.size + b.size) / 2 + gap;
  return Math.abs(a.x - b.x) < clearance && Math.abs(a.y - b.y) < clearance;
}

/** Stable priority, actual hit rectangles, and outward movement along the projected ray. */
export function separateWidgets(
  targets: readonly WidgetTarget[],
  obstacles: readonly WidgetTarget[],
): WidgetTarget[] {
  const placed = [...obstacles];
  return targets.map((target, index) => {
    const length = Math.hypot(target.x, target.y);
    const angle = (index * Math.PI * 2) / targets.length;
    const dx = length > 1 ? target.x / length : Math.cos(angle);
    const dy = length > 1 ? target.y / length : Math.sin(angle);
    let distance = 0;
    // Each obstacle excludes one interval on this ray. Jump beyond that interval
    // rather than iterating pixels or imposing a cap that can leave an overlap.
    for (let pass = 0; pass <= placed.length; pass++) {
      const candidate = { ...target, x: target.x + dx * distance, y: target.y + dy * distance };
      const collision = placed.find((other) => overlaps(candidate, other, 6));
      if (!collision) {
        placed.push(candidate);
        return candidate;
      }
      const radius = (target.size + collision.size) / 2 + 7;
      const exitX =
        Math.abs(dx) < 1e-8 ? Infinity : (collision.x + Math.sign(dx) * radius - target.x) / dx;
      const exitY =
        Math.abs(dy) < 1e-8 ? Infinity : (collision.y + Math.sign(dy) * radius - target.y) / dy;
      distance = Math.max(distance, Math.min(exitX, exitY));
    }
    throw new Error("Widget clearance did not converge");
  });
}

/** Animate only collision corrections: normal camera/model tracking remains immediate. */
export class WidgetClearance {
  private targets = new Map<HTMLElement, { x: number; y: number }>();
  private hovering = false;
  private pressed = false;
  private controller = new AbortController();

  constructor(private root: HTMLElement) {
    const options = { signal: this.controller.signal, capture: true };
    root.addEventListener("pointerover", this.freeze, options);
    root.addEventListener(
      "pointerout",
      (event) => {
        if (event.relatedTarget instanceof Node && root.contains(event.relatedTarget)) return;
        this.hovering = false;
        this.resume();
      },
      options,
    );
    root.addEventListener(
      "pointerdown",
      () => {
        this.pressed = true;
        this.freeze();
      },
      options,
    );
    for (const type of ["pointerup", "pointercancel", "blur"])
      window.addEventListener(
        type,
        () => {
          this.pressed = false;
          if (type === "blur") this.hovering = false;
          this.resume();
        },
        options,
      );
  }

  private freeze = (): void => {
    if (this.hovering) return;
    this.hovering = true;
    for (const element of this.targets.keys()) {
      const translation = getComputedStyle(element).translate;
      element.style.transition = "none";
      element.style.translate = translation;
    }
  };

  private resume(): void {
    if (this.hovering || this.pressed) return;
    for (const [element, point] of this.targets) {
      element.style.transition = window.matchMedia("(prefers-reduced-motion: reduce)").matches
        ? "none"
        : "translate 100ms ease-out";
      element.style.translate = `${point.x}px ${point.y}px`;
    }
  }

  update(
    entries: { element: HTMLElement; nominal: WidgetTarget }[],
    obstacles: WidgetTarget[],
  ): void {
    const positions = separateWidgets(
      entries.map((entry) => entry.nominal),
      obstacles,
    );
    entries.forEach(({ element, nominal }, index) => {
      element.style.left = `${nominal.x}px`;
      element.style.top = `${nominal.y}px`;
      const correction = { x: positions[index].x - nominal.x, y: positions[index].y - nominal.y };
      if (!this.targets.has(element) || this.root.hidden) {
        element.style.transition = "none";
        element.style.translate = `${correction.x}px ${correction.y}px`;
      }
      this.targets.set(element, correction);
    });
    this.resume();
  }

  dispose(): void {
    this.controller.abort();
    this.targets.clear();
  }
}
