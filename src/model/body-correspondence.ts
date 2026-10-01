import type { Body } from "./body.js";

/** Immediate calculation correspondence, consumed by attached metadata; never serialized. */
export const topologyOrigins = new WeakMap<
  Body,
  {
    bodies: readonly string[];
    copy: boolean;
    faces: ReadonlyMap<string, readonly string[]>;
  }
>();
