import type { PlaneFrame } from "../sketch/planes.js";

export interface PlaneCut {
  mode: "split" | "imprint";
  targets: { body: string; faces?: string[] }[];
  frame: PlaneFrame;
}
