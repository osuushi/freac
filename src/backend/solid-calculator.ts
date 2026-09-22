import { resolve } from "node:path";
import type {
  Body,
  BodyBoolean,
  BodyEdgeFinish,
  BodyFaceOffset,
  BodyShell,
  BodyTransform,
  EdgeMovement,
  FaceMovement,
} from "../model/body.js";
import type { CleanupSelection } from "../model/cleanup.js";
import type { kernelInput, pathSweepInput, revolveInput } from "./kernel-input.js";
import type { KernelResult } from "./kernel-result.js";
import { NativeCalculator } from "./native-calculator.js";
import type { projectionInput } from "./projection.js";

export class SolidCalculator extends NativeCalculator<
  | ReturnType<typeof kernelInput>
  | ReturnType<typeof revolveInput>
  | ReturnType<typeof pathSweepInput>
  | ReturnType<typeof projectionInput>
  | (import("../model/plane-cut.js").PlaneCut & { kind: "plane-cut"; bodies: readonly Body[] })
  | { kind: "cleanup" | "delete-topology"; selection: CleanupSelection[]; bodies: readonly Body[] }
  | { kind: "inspect"; bodies: readonly Body[] }
  | {
      kind: "scale";
      ids: string[];
      pivot: import("../sketch/planes.js").Vector;
      factor: number;
      bodies: readonly Body[];
    }
  | {
      kind: "scale-boundaries";
      faces: BodyFaceOffset["faces"];
      edges: BodyEdgeFinish["edges"];
      pivot: import("../sketch/planes.js").Vector;
      factor: number;
      bodies: readonly Body[];
    }
  | ReturnType<typeof import("./measurement-input.js").measurementInput>
  | (Omit<BodyEdgeFinish, "size"> & { kind: "edge-finish-selection"; bodies: readonly Body[] })
  | (Omit<Extract<import("../model/mirror.js").MirrorOperation, { kind: "bodies" }>, "kind"> & {
      kind: "mirror";
      bodies: readonly Body[];
    })
  | (BodyShell & { kind: "shell"; bodies: readonly Body[] })
  | (BodyFaceOffset & { kind: "offset-faces"; bodies: readonly Body[] })
  | (EdgeMovement & { kind: "move-edges"; bodies: readonly Body[] })
  | (FaceMovement & { kind: "move-faces"; bodies: readonly Body[] })
  | (BodyEdgeFinish & { kind: "edge-finish"; bodies: readonly Body[] })
  | (BodyBoolean & { kind: "boolean"; bodies: readonly Body[] })
  | (BodyTransform & { kind: "transform"; bodies: readonly Body[] }),
  KernelResult
> {
  private superseded = false;
  constructor(
    executable = resolve(
      ".build/kernel/bin",
      process.platform === "win32" ? "freac-kernel.exe" : "freac-kernel",
    ),
  ) {
    super(executable, "Solid kernel");
  }
  begin(): void {
    this.superseded = false;
  }
  supersede(): void {
    this.superseded = true;
  }
  get wasSuperseded(): boolean {
    return this.superseded;
  }
  async probe(input: Parameters<SolidCalculator["calculate"]>[0]): Promise<KernelResult> {
    if (this.superseded) throw new Error("Preview superseded");
    // Finish the current probe so useful geometry can still reach the viewport.
    // Supersession prevents subsequent probes, rather than starving every frame.
    return this.calculate(input);
  }
}
