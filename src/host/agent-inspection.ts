import { randomUUID } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { BrowserWindow } from "electron";
import {
  findInspectionTarget,
  inspectionOverview,
  measurable,
  targetGeometry,
} from "../agent/inspection-geometry.js";
import type { InspectionCommand, InspectionView } from "../agent/inspection-protocol.js";
import type { DocumentOwner } from "../backend/document-owner.js";
import { readInspectionView } from "./inspection-view.js";

export async function inspectDrawing(
  owner: DocumentOwner,
  window: BrowserWindow,
  command: InspectionCommand,
  entity: string | undefined,
  directory: string,
  isCurrent: () => boolean,
  readView: (render: boolean) => Promise<InspectionView> = (render) =>
    readInspectionView(window, render),
): Promise<unknown> {
  const document = owner.view.data;
  const check = () => {
    if (!isCurrent() || owner.view.data !== document || owner.view.candidate)
      throw new Error("The drawing changed during inspection. Run the command again.");
  };
  check();
  const view = await readView(command === "render");
  check();
  const { image, ...context } = view;
  if (command === "render") {
    if (!image?.data.startsWith("data:image/png;base64,") || image.data.length > 24 * 1024 * 1024)
      throw new Error("Invalid viewport image.");
    const path = join(directory, `viewport-${randomUUID()}.png`);
    await writeFile(
      path,
      Buffer.from(image.data.slice("data:image/png;base64,".length), "base64"),
      { flag: "wx", mode: 0o600 },
    );
    check();
    return {
      units: "mm",
      path,
      width: image.width,
      height: image.height,
      ...context,
      note: "Current geometry viewport, including selection highlights and visual clipping. HTML controls/labels excluded. Not an exact section.",
    };
  }
  if (command === "inspect" && !entity) return { ...inspectionOverview(document, view), context };
  const targets = entity ? [findInspectionTarget(document, entity)] : view.selection;
  const geometry = targets.map((target) => ({
    target,
    geometry: targetGeometry(document, target),
  }));
  const measurementTargets = measurable(targets);
  let measurement = null,
    measurementError: string | undefined;
  if (measurementTargets.length) {
    const reply = await owner.call({ kind: "measure", targets: measurementTargets });
    measurement = reply.measurement ?? null;
    measurementError = reply.error;
    check();
  }
  return { units: "mm", context, targets: geometry, measurement, measurementError };
}
