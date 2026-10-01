import type { Body, BodyGeometry } from "../src/model/body.js";
import type { DisplayDocument } from "../src/model/display-document.js";
import type { SketchDocument } from "../src/sketch/document.js";

// Compile-time acceptance boundary: presentation alone is never exact model data.
export const displayCannotPublish: DisplayDocument extends SketchDocument ? never : true = true;
export const drawingCannotCalculate: BodyGeometry extends Body ? never : true = true;
export const exactCanDisplay: SketchDocument extends DisplayDocument ? true : never = true;
