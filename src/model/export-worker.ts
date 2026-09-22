import type { Body } from "./body.js";
import { type ExportFormat, exportBodies } from "./mesh-export.js";

self.onmessage = (event: MessageEvent<{ bodies: Body[]; format: ExportFormat }>) => {
  try {
    const bytes = exportBodies(event.data.bodies, event.data.format);
    self.postMessage({ bytes }, { transfer: [bytes.buffer] });
  } catch (error) {
    self.postMessage({ error: error instanceof Error ? error.message : String(error) });
  }
};
