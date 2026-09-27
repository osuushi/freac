import { threadTolerance } from "./precision.js";
import type { ThreadSettings } from "./thread-settings.js";

export interface ThreadPreviewResolution {
  segments: number;
  samples: number;
}

/** Choose mesh density; adaptive overrides affect preview only. */
export function threadSampling(
  settings: ThreadSettings,
  depth: number,
  high: number,
  quality: "preview" | "export",
  previewResolution?: ThreadPreviewResolution,
) {
  const tolerance = quality === "preview" ? 0.08 : threadTolerance(settings);
  const baseSegments = Math.max(
    32,
    Math.ceil(Math.PI / Math.acos(1 - Math.min(0.1, tolerance / (2 * high)))),
  );
  const segments =
    quality === "preview" && previewResolution
      ? Math.max(12, Math.min(baseSegments, Math.round(previewResolution.segments)))
      : baseSegments;
  // Straight profile facets are aligned to crest/root corners in threadGrid.
  // Their mixed radial/angular interpolation needs fewer axial samples.
  const linearProfile =
    settings.profile !== "rounded" && !settings.startTaper && !settings.endTaper;
  const baseSamples =
    quality === "preview"
      ? 12
      : linearProfile
        ? Math.max(
            8,
            Math.ceil(
              ((settings.profile === "metric" ? Math.sqrt(3) * settings.pitch : 2 * depth) *
                Math.PI) /
                (segments * tolerance),
            ),
          )
        : Math.max(32, Math.ceil(Math.PI * Math.sqrt(depth / tolerance)));
  const samples =
    quality === "preview" && previewResolution
      ? Math.max(6, Math.min(baseSamples, Math.round(previewResolution.samples)))
      : baseSamples;
  return { tolerance, segments, samples };
}
