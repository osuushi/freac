import type { KernelRequest } from "./kernel-request.js";
import {
  analyticCurve,
  array,
  bounds,
  flag,
  frame,
  number,
  object,
  positive,
  references,
  requireKernel,
  sign,
  text,
  vector,
} from "./kernel-values.js";

export function validateKernelCurves(values: unknown): void {
  const point = (value: unknown) => {
    const p = object(value);
    number(p.x);
    number(p.y);
  };
  for (const value of array(values)) {
    const curve = object(value);
    text(curve.id); // Native placeholders are replaced when curves enter a sketch.
    flag(curve.construction);
    if (curve.kind === "circle") {
      point(curve.center);
      positive(curve.radius);
      continue;
    }
    requireKernel(["segment", "arc", "bezier"].includes(String(curve.kind)), "sketch curve kind");
    point(curve.a);
    point(curve.b);
    if (curve.kind === "arc") {
      requireKernel(number(curve.bulge) !== 0, "arc curvature");
      requireKernel(
        curve.semicircleBranch === undefined || curve.semicircleBranch === "major",
        "arc branch",
      );
    }
    if (curve.kind === "bezier") {
      point(curve.c1);
      point(curve.c2);
    }
  }
}
export function validateKernelMeasurement(value: unknown): void {
  const measurement = object(value);
  for (const value of array(measurement.properties)) {
    const property = object(value);
    text(property.label);
    number(property.value);
    requireKernel(["mm", "mm²", "°"].includes(String(property.unit)), "measurement unit");
  }
  array(measurement.relationships).forEach(text);
  for (const name of ["distance", "minimumGap", "maximumGap"] as const) {
    if (measurement[name] === undefined) continue;
    const distance = object(measurement[name]);
    requireKernel(number(distance.value) >= 0, "measured distance");
    const points = array(distance.points);
    requireKernel(points.length === 2, "distance witnesses");
    for (const point of points) vector(point);
  }
  if (measurement.approximate !== undefined) flag(measurement.approximate);
  if (measurement.gapReason !== undefined) text(measurement.gapReason);
}
function topologySurface(value: unknown): void {
  const surface = object(value);
  if (surface.kind === "other") return;
  if (surface.kind === "plane") {
    frame(surface);
    return;
  }
  requireKernel(surface.kind === "cylinder" || surface.kind === "cone", "surface kind");
  vector(surface.origin);
  vector(surface.axis, true);
  requireKernel(number(surface.radius) >= 0, "surface radius");
  sign(surface.outward);
  if (surface.kind === "cone") number(surface.semiAngle);
}
export function validateKernelTopology(
  value: unknown,
  input: Extract<KernelRequest, { kind: "topology" }>,
): void {
  const topology = object(value);
  requireKernel(topology.body === input.body && topology.units === "mm", "topology body");
  const body = input.bodies.find((body) => body.id === input.body);
  requireKernel(body, "topology source");
  const faces = new Set(body.faces.map((face) => face.id));
  const edges = new Set(body.edges.map((edge) => edge.id));
  const returnedFaces = array(topology.faces).map(object);
  const returnedEdges = array(topology.edges).map(object);
  requireKernel(
    returnedFaces.length === faces.size && returnedEdges.length === edges.size,
    "topology count",
  );
  references(
    returnedFaces.map((face) => face.id),
    faces,
  );
  references(
    returnedEdges.map((edge) => edge.id),
    edges,
  );
  for (const face of returnedFaces) {
    flag(face.reversed);
    topologySurface(face.surface);
    requireKernel(number(face.area) >= 0, "face area");
    bounds(face.bounds);
    for (const value of array(face.loops)) {
      const loop = object(value);
      flag(loop.outer);
      for (const value of array(loop.edges)) {
        const edge = object(value);
        requireKernel(edges.has(text(edge.edge)), "wire edge");
        flag(edge.reversed);
        flag(edge.seam);
      }
    }
  }
  for (const edge of returnedEdges) {
    references(edge.faces, faces);
    analyticCurve(edge.curve, true);
  }
}
