import { curveDistance, displayPoints } from "./curve-geometry.js";
import type { SketchEditor } from "./editor.js";
import { GestureSolve } from "./gesture-solve.js";
import type { Point } from "./planes.js";
import { distance } from "./point-math.js";
import { trimChain } from "./trim-chain.js";
import { trimOverlappingSketch } from "./trim-edit.js";
import { spanCurve, type TrimSpan, trimAt, trimSpanLength } from "./trim-geometry.js";

export class TrimControls {
  private svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  private mark = document.createElementNS("http://www.w3.org/2000/svg", "polyline");
  private abort = new AbortController();
  private pointer: Point | null = null;
  private start: Point | null = null;
  private spans: TrimSpan[] = [];
  private chain = document.createElementNS("http://www.w3.org/2000/svg", "g");
  private intersectionsOnly = false;
  constructor(
    private editor: SketchEditor,
    overlay: HTMLElement,
  ) {
    this.svg.classList.add("trim-overlay");
    this.mark.classList.add("trim-span");
    this.svg.append(this.mark, this.chain);
    overlay.append(this.svg);
    const options = { signal: this.abort.signal },
      canvas = editor.world.canvas;
    canvas.addEventListener(
      "pointermove",
      (event) => {
        if (editor.tool !== "trim" || editor.blocked || event.buttons) return;
        this.intersectionsOnly = event.shiftKey;
        this.pointer = { x: event.clientX, y: event.clientY };
        this.update();
      },
      options,
    );
    canvas.addEventListener(
      "pointerdown",
      (event) => {
        if (event.button !== 0 || editor.tool !== "trim" || editor.blocked) return;
        event.preventDefault();
        canvas.focus();
        this.start = { x: event.clientX, y: event.clientY };
      },
      options,
    );
    canvas.addEventListener(
      "pointerup",
      (event) => {
        const start = this.start;
        this.start = null;
        if (!start || event.button !== 0 || editor.blocked || editor.tool !== "trim") return;
        this.intersectionsOnly = event.shiftKey;
        this.pointer = { x: event.clientX, y: event.clientY };
        if (distance(start, this.pointer) > 4) return;
        const choices = this.targets();
        if (choices.length) void this.apply(choices[0]);
      },
      options,
    );
    canvas.addEventListener(
      "pointercancel",
      () => {
        this.start = null;
      },
      options,
    );
    window.addEventListener("keydown", this.modifiers, options);
    window.addEventListener("keyup", this.modifiers, options);
    window.addEventListener("blur", () => void this.cancel(), options);
    editor.world.changed.add(this.update);
    this.update();
  }
  private modifiers = (event: KeyboardEvent): void => {
    if (this.intersectionsOnly === event.shiftKey) return;
    this.intersectionsOnly = event.shiftKey;
    this.update();
  };
  private targets(): TrimSpan[][] {
    const sketch = this.editor.sketch,
      p = this.pointer;
    if (!sketch || !p || !this.editor.world.active) return [];
    const point = this.editor.world.pointAt(sketch.plane, p.x, p.y);
    if (!point) return [];
    const scale = this.editor.world.canvas.clientHeight / this.editor.world.height;
    const near = sketch.curves
      .map((curve) => ({ curve, d: curveDistance(curve, point) * scale }))
      .filter((c) => c.d <= 8)
      .sort((a, b) => a.d - b.d);
    return near
      .filter((c) => c.d <= near[0].d + 1)
      .map((c) => trimAt(c.curve, sketch.curves, point, this.intersectionsOnly))
      .map((span) => (this.intersectionsOnly ? trimChain(span, sketch.curves) : [span]))
      .sort(
        (a, b) =>
          a.reduce((sum, s) => sum + trimSpanLength(s), 0) -
          b.reduce((sum, s) => sum + trimSpanLength(s), 0),
      );
  }
  private async apply(spans: TrimSpan[]): Promise<void> {
    const sketch = this.editor.sketch;
    if (!sketch || this.editor.blocked) return;
    const interaction = this.editor.interactions.acquire(
      "trim",
      () => {
        cancelled = true;
      },
      undefined,
      { navigation: "when-released" },
    );
    if (!interaction) return;
    let cancelled = false;
    const solve = new GestureSolve(this.editor, interaction);
    interaction.wait();
    try {
      const result = trimOverlappingSketch(sketch, spans);
      solve.update(result.sketch);
      const valid = await solve.flush();
      if (!valid || cancelled) {
        await solve.cancel();
        return;
      }
      if (!interaction.close()) return;
      await this.editor.accept();
      this.editor.select([]);
      this.spans = [];
      this.pointer = null;
      this.render();
    } catch (error) {
      this.editor.message = error instanceof Error ? error.message : String(error);
    } finally {
      interaction.release();
    }
  }
  private cancel(): void {
    this.intersectionsOnly = false;
    this.start = null;
    this.spans = [];
    this.pointer = null;
    this.render();
  }
  private render(): void {
    const r = this.editor.world.canvas.getBoundingClientRect(),
      sketch = this.editor.sketch;
    this.svg.setAttribute("viewBox", `0 0 ${r.width} ${r.height}`);
    const marks = this.spans.map((span, i) => {
      const mark =
        i === 0 ? this.mark : document.createElementNS("http://www.w3.org/2000/svg", "polyline");
      mark.classList.add("trim-span");
      mark.dataset.curve = span.curve.id;
      mark.setAttribute(
        "points",
        !sketch
          ? ""
          : displayPoints(spanCurve(span), this.editor.world.height / r.height)
              .map((p) => {
                const s = this.editor.world.projectLocal(sketch.plane, p);
                return `${s.x - r.left},${s.y - r.top}`;
              })
              .join(" "),
      );
      return mark;
    });
    this.chain.replaceChildren(...marks.slice(1));
    if (!marks.length) {
      this.mark.setAttribute("points", "");
      this.mark.dataset.curve = "";
    }
  }
  private update = (): void => {
    const active = this.editor.tool === "trim" && !!this.editor.world.active;
    this.svg.style.display = active ? "" : "none";
    if (!active) {
      this.pointer = null;
      this.spans = [];
      return;
    }
    this.spans = this.editor.blocked ? [] : (this.targets()[0] ?? []);
    this.editor.world.canvas.style.cursor = "crosshair";
    this.render();
  };
  dispose(): void {
    this.abort.abort();
    this.editor.world.changed.delete(this.update);
    this.svg.remove();
  }
}
