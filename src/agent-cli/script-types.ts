/** Public script declarations, included in the actual pre-execution typecheck. */
export const scriptTypes = `
export type Point = { x: number; y: number };
export type ScriptCurve =
  | { kind: "segment"; a: Point; b: Point }
  | { kind: "circle"; center: Point; radius: number }
  | { kind: "arc"; a: Point; b: Point; bulge: number }
  | { kind: "bezier"; a: Point; c1: Point; c2: Point; b: Point };
export interface SketchResult {
  sketch: string; curves: string[]; profiles: { sketch: string; profile: string }[];
}
export interface ScaleResult extends SolidResult { sketches: SketchResult[] }
export interface SolidResult {
  bodies: { id: string; volume: number; faces: string[]; edges: string[] }[];
}
/** Distances mm, angles degrees. Await each call; parallel edits reject. */
export interface FreacScript {
  /** Omit id to create, or provide an existing plane id to reposition it. */
  constructionPlane(input: { id?: string; frame: Plane }): Promise<{ plane: string; frame: Plane }>;
  deleteConstructionPlane(input: { id: string }): Promise<{ removed: string }>;
  splitBody(input: { targets: { body: string }[]; frame: Plane }): Promise<SolidResult>;
  imprint(input: { targets: { body: string; faces: string[] }[]; frame: Plane }): Promise<SolidResult>;
  scale(input: ({ kind: "curves"; sketchId: string; ids: string[] } |
    { kind: "sketches"; ids: string[] } |
    { kind: "solids"; ids: string[]; faces: { body: string; face: string }[]; edges: { body: string; edge: string }[] }) &
    { pivot: Vector; factor: number }): Promise<ScaleResult>;
  /** Subtract uses the first body as base; keepOriginals retains its tools. */
  booleanBodies(input: { ids: string[]; mode: "union" | "subtract" | "intersect"; keepOriginals: boolean }): Promise<SolidResult>;
  /** size is mm; zero does nothing. Unachievable sizes reject instead of clamping. */
  finishEdges(input: { edges: { body: string; edge: string }[]; mode: "fillet" | "chamfer"; size: number }): Promise<SolidResult>;
  /** Negative thickness inward, positive outward. Empty faces means no opening. */
  shell(input: { selection: { body: string; faces: string[] }[]; thickness: number }): Promise<SolidResult>;
  /** Captured when the script starts. Point owners are not whole-curve targets. */
  readonly selection: readonly Target[];
  createSketch(input: { plane: "XY" | "XZ" | "YZ" | Plane; curves: ScriptCurve[] }): Promise<SketchResult>;
  extrude(input: {
    sources: ({ sketch: string; profile: string } | { face: string })[];
    symmetric?: boolean;
    distance: number; mode: "new" | "union" | "subtract" | "intersect" | "auto";
    targets?: string[]; eligibleTargets?: string[];
    draft?: { mode: "angle" | "offset"; value: number };
    twist?: { angle: number; origin: Vector };
  }): Promise<SolidResult>;
  /** World-space smooth path, following corrected-Frenet orientation. Initial section is perpendicular to its first tangent. */
  sweep(input: {
    sources: ({ sketch: string; profile: string } | { face: string })[];
    path: ({kind:"line";a:Vector;b:Vector} | {kind:"bezier";a:Vector;c1:Vector;c2:Vector;b:Vector})[];
    mode: "new" | "union" | "subtract" | "intersect" | "auto";
    targets?: string[]; eligibleTargets?: string[];
  }): Promise<SolidResult>;
  /** Signed angle in degrees; height is TOTAL axial travel in mm, not pitch. */
  revolve(input: {
    sources: ({ sketch: string; profile: string } | { face: string })[];
    axis: { origin: Vector; direction: Vector };
    angle: number; height: number; mode: "new" | "union" | "subtract" | "intersect" | "auto";
    targets?: string[]; eligibleTargets?: string[];
  }): Promise<SolidResult>;
  offsetFaces(input: { faces: { body: string; face: string }[]; distance: number; radius?: number }): Promise<SolidResult>;
  transformBodies(input: {
    ids: string[]; translation: Vector; pivot: Vector; axis: Vector; angle: number; duplicate: boolean;
  }): Promise<SolidResult>;
}
declare global { const freac: FreacScript; }
`;
