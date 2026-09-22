import type { Point } from "../sketch/planes.js";
import type { SolverInput } from "./solver-input.js";

export function checkResiduals(input: SolverInput, points: Point[], radii: number[] = []): void {
  validateResult(input, points, radii);
  for (const equation of input.constraints) {
    if (equation.temporary) continue;
    if (equation.kind === "tangent-normal") {
      checkNormal(equation, points);
      continue;
    }
    if (equation.kind === "radius") {
      if (Math.abs(radii[equation.a] - (equation.value ?? 0)) > 1e-7)
        throw new Error("Solved radius does not satisfy the lock");
      continue;
    }
    const a = points[equation.a],
      b = points[equation.b ?? equation.a];
    let residual = 0;
    switch (equation.kind) {
      case "corner-angle":
        residual = angleResidual(equation, points);
        break;
      case "tangent-circles": {
        const ra = radii[equation.radius ?? -1],
          rb = radii[equation.otherRadius ?? -1];
        residual =
          Math.hypot(b.x - a.x, b.y - a.y) - (equation.internal ? Math.abs(ra - rb) : ra + rb);
        break;
      }
      case "tangent-line": {
        const end = points[equation.a + 1];
        const dx = end.x - a.x,
          dy = end.y - a.y;
        residual =
          ((b.x - a.x) * -dy + (b.y - a.y) * dx) / Math.hypot(dx, dy) -
          (equation.side ?? 1) * radii[equation.radius ?? -1];
        break;
      }
      case "on-line": {
        const end = points[(equation.b ?? 0) + 1];
        const dx = end.x - b.x,
          dy = end.y - b.y;
        residual = ((a.x - b.x) * dy - (a.y - b.y) * dx) / Math.hypot(dx, dy);
        break;
      }
      case "on-circle":
        residual = Math.hypot(b.x - a.x, b.y - a.y) - radii[equation.radius ?? -1];
        break;
      case "horizontal":
        residual = points[equation.a + 1].y - a.y;
        break;
      case "vertical":
        residual = points[equation.a + 1].x - a.x;
        break;
      case "equal":
        residual =
          Math.hypot(points[equation.a + 1].x - a.x, points[equation.a + 1].y - a.y) -
          Math.hypot(points[(equation.b ?? 0) + 1].x - b.x, points[(equation.b ?? 0) + 1].y - b.y);
        break;
      case "x":
        residual = a.x - (equation.value ?? 0);
        break;
      case "y":
        residual = a.y - (equation.value ?? 0);
        break;
      case "distance":
        residual = Math.hypot(b.x - a.x, b.y - a.y) - (equation.value ?? 0);
        break;
      case "angle": {
        const delta = Math.atan2(b.y - a.y, b.x - a.x) - (equation.value ?? 0);
        residual = Math.atan2(Math.sin(delta), Math.cos(delta));
        break;
      }
      case "coincident":
        residual = Math.hypot(b.x - a.x, b.y - a.y);
        break;
      default: {
        const endA = points[equation.a + 1],
          endB = points[(equation.b ?? 0) + 1];
        const ax = endA.x - a.x,
          ay = endA.y - a.y,
          bx = endB.x - b.x,
          by = endB.y - b.y;
        residual =
          (equation.kind === "parallel" ? ax * by - ay * bx : ax * bx + ay * by) /
          (Math.hypot(ax, ay) * Math.hypot(bx, by));
      }
    }
    if (!Number.isFinite(residual) || Math.abs(residual) > 1e-7)
      throw new Error("Solved geometry does not satisfy the edit");
  }
}

function checkNormal(e: import("./solver-input.js").Equation, points: Point[]): void {
  const a = points[e.a],
    b = points[e.b ?? -1],
    c = points[e.c ?? -1],
    d = points[e.d ?? -1];
  const ax = b.x - a.x,
    ay = b.y - a.y,
    bx = d.x - c.x,
    by = d.y - c.y;
  const residual =
    (e.parallel ? ax * by - ay * bx : ax * bx + ay * by) /
    (Math.hypot(ax, ay) * Math.hypot(bx, by));
  if (!Number.isFinite(residual) || Math.abs(residual) > 1e-7)
    throw new Error("Solved tangent directions disagree");
}

function validateResult(input: SolverInput, points: Point[], radii: number[]): void {
  if (
    points.length !== input.points.length ||
    points.some((p) => !Number.isFinite(p.x) || !Number.isFinite(p.y))
  )
    throw new Error("Invalid solver result");
  if (radii.length !== input.radii.length || radii.some((r) => !Number.isFinite(r) || r <= 0))
    throw new Error("Invalid solved radii");
}

function angleResidual(equation: import("./solver-input.js").Equation, points: Point[]): number {
  const a = points[equation.a],
    b = points[equation.b ?? 0];
  const ae = points[equation.a + 1],
    be = points[(equation.b ?? 0) + 1];
  const first = Math.atan2(ae.y - a.y, ae.x - a.x) + (equation.reverseA ? Math.PI : 0);
  const second = Math.atan2(be.y - b.y, be.x - b.x) + (equation.reverseB ? Math.PI : 0);
  const delta = second - first - (equation.value ?? 0);
  return Math.atan2(Math.sin(delta), Math.cos(delta));
}
