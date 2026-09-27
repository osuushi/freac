import type { Vector } from "../sketch/planes.js";

/** Radius is measured at origin; cone radius at axial distance t is radius + t*tan(semiAngle). */
export type AxialSurface =
  | { kind: "cylinder"; origin: Vector; axis: Vector; radius: number }
  | { kind: "cone"; origin: Vector; axis: Vector; radius: number; semiAngle: number };
export interface FaceReplacement {
  body: string;
  face: string;
  surface: AxialSurface;
}
export interface BodyTopology {
  body: string;
  units: "mm";
  faces: {
    id: string;
    reversed: boolean;
    surface:
      | (AxialSurface & { outward: 1 | -1 })
      | { kind: "plane"; origin: Vector; u: Vector; v: Vector }
      | { kind: "other" };
    area: number;
    /** Conservative world kernel bounds, not exact dimensions. */
    bounds: number[];
    /** Ordered uses relative to the forward support; seams occur twice. */
    loops: { outer: boolean; edges: { edge: string; reversed: boolean; seam: boolean }[] }[];
  }[];
  edges: {
    id: string;
    faces: string[];
    curve:
      | { kind: "line"; a: Vector; b: Vector }
      | {
          kind: "circle";
          center: Vector;
          normal: Vector;
          xAxis: Vector;
          radius: number;
          start: number;
          end: number;
        }
      | { kind: "other" };
  }[];
}
