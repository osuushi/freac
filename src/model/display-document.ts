import type { SketchDocument } from "../sketch/document.js";
import type { BodyGeometry } from "./body.js";

/** Accepted data or a temporary view; display-only bodies cannot be published as exact bodies. */
export interface DisplayDocument extends Omit<SketchDocument, "bodies"> {
  readonly bodies?: readonly BodyGeometry[];
}
