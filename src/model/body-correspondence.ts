import type { BodyGeometry } from "./body.js";

/** Immediate calculation correspondence, consumed by attached metadata; never serialized. */
export const topologyOrigins = new WeakMap<
  BodyGeometry,
  {
    bodies: readonly string[];
    copy: boolean;
    edges?: ReadonlyMap<string, readonly string[]>;
    faces: ReadonlyMap<string, readonly string[]>;
  }
>();
