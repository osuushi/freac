import type { ModelReply, ModelRequest, ModelView } from "../sketch/model-api.js";
import { validateFrame } from "../sketch/planes.js";
import { measurementInput } from "./measurement-input.js";
import { SolidCalculator } from "./solid-calculator.js";

type Query = Extract<ModelRequest, { kind: "sections" | "measure" }>;

/** Section refresh and selection readouts share one serialized read-only worker. */
export class GeometryQueries {
  private kernel: SolidCalculator;
  private pending = Promise.resolve();
  private closed = false;
  constructor(executable?: string) {
    this.kernel = new SolidCalculator(executable);
  }
  call(view: ModelView, request: Query): Promise<ModelReply> {
    const result = this.pending.then(() => this.calculate(view, request));
    this.pending = result.then(() => {});
    return result;
  }
  private async calculate(view: ModelView, request: Query): Promise<ModelReply> {
    try {
      if (this.closed) throw new Error("Geometry query cancelled");
      if (request.kind === "measure") {
        const result = await this.kernel.calculate(measurementInput(view.data, request.targets));
        return { view, measurement: result.measurement };
      }
      validateFrame(request.frame);
      const result = await this.kernel.calculate({
        kind: "sections",
        frame: request.frame,
        bodies: (view.data.bodies ?? []).filter((b) => request.bodies.includes(b.id)),
      });
      return { view, sections: result.sections };
    } catch (error) {
      return { view, error: error instanceof Error ? error.message : String(error) };
    }
  }
  close(): void {
    this.closed = true;
    this.kernel.close();
  }
}
