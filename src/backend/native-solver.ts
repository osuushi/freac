import { resolve } from "node:path";
import { NativeCalculator } from "./native-calculator.js";
import type { SolverInput, SolverResult } from "./solver-input.js";

export class NativeSolver extends NativeCalculator<SolverInput, SolverResult> {
  constructor(
    executable = resolve(
      ".build/solver/bin",
      process.platform === "win32" ? "freac-solver.exe" : "freac-solver",
    ),
  ) {
    super(executable, "Sketch solver");
  }
  solve(input: SolverInput): Promise<SolverResult> {
    return this.calculate(input);
  }
}
