import type { Body, Extrusion, LiftSource, Revolution } from "../model/body.js";
import type { PathSweep } from "../model/path-sweep.js";
import type { SketchDocument } from "../sketch/document.js";
import type { PlaneFrame } from "../sketch/planes.js";
import { profilesFor } from "../sketch/profiles.js";
import { boundary } from "./profile-boundary.js";

function profileInput(document: SketchDocument, sources: LiftSource[], bodies: readonly Body[]) {
  let direction: number[] | undefined;
  const profiles = sources.map((source) => {
    let frame: PlaneFrame;
    let profile:
      | { face: string }
      | { outer: ReturnType<typeof boundary>; holes: ReturnType<typeof boundary>[] };
    if ("face" in source) {
      const face = bodies.flatMap((body) => body.faces).find((face) => face.id === source.face);
      if (!face?.plane) throw new Error("Select a planar face");
      frame = face.plane;
      profile = source;
    } else {
      const sketch = document.sketches.find((sketch) => sketch.id === source.sketch);
      if (!sketch) throw new Error("Source sketch does not exist");
      const region = profilesFor(sketch).find((profile) => profile.key === source.profile);
      if (!region)
        throw new Error(
          "Profile key does not match a current closed region. Inspect the source sketch for current profile keys.",
        );
      frame = sketch.plane;
      profile = {
        outer: boundary(region.outer, frame),
        holes: region.holes.map((hole) => boundary(hole, frame)),
      };
    }
    const { u, v } = frame;
    const normal = [
      u[1] * v[2] - u[2] * v[1],
      u[2] * v[0] - u[0] * v[2],
      u[0] * v[1] - u[1] * v[0],
    ];
    if (direction && Math.abs(direction.reduce((sum, n, i) => sum + n * normal[i], 0)) < 1 - 1e-7)
      throw new Error("Selected profiles must have parallel planes");
    direction ??= normal;
    return profile;
  });
  if (!direction) throw new Error("Select a closed profile or planar face");
  return {
    normal: direction,
    profiles,
    bodies: bodies.map(({ id, brep, faces, edges }) => ({
      id,
      brep,
      faces: faces.map(({ id, signature }) => ({ id, signature })),
      edges: edges.map(({ id, signature }) => ({ id, signature })),
    })),
  };
}

export function kernelInput(
  document: SketchDocument,
  extrusion: Extrusion,
  bodies: readonly Body[],
) {
  return {
    ...profileInput(document, extrusion.sources, bodies),
    kind: "extrude",
    mode: extrusion.mode,
    distance: extrusion.distance,
    symmetric: extrusion.symmetric,
    draft: extrusion.draft,
    twist: extrusion.twist,
    targets: extrusion.targets,
    eligibleTargets: extrusion.eligibleTargets,
  };
}

export function revolveInput(
  document: SketchDocument,
  operation: Revolution,
  bodies: readonly Body[],
) {
  return {
    ...profileInput(document, operation.sources, bodies),
    kind: "revolve",
    mode: operation.mode,
    targets: operation.targets,
    eligibleTargets: operation.eligibleTargets,
    axis: operation.axis,
    angle: operation.angle,
    height: operation.height,
  };
}

export function pathSweepInput(
  document: SketchDocument,
  operation: PathSweep,
  bodies: readonly Body[],
) {
  return {
    ...profileInput(document, operation.sources, bodies),
    kind: "path-sweep",
    path: operation.path,
    mode: operation.mode,
    targets: operation.targets,
    eligibleTargets: operation.eligibleTargets,
  };
}
