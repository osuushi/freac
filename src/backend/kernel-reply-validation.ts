import { validateKernelBodies } from "./kernel-body-validation.js";
import {
  validateKernelCurves,
  validateKernelMeasurement,
  validateKernelTopology,
} from "./kernel-query-validation.js";
import type { KernelReply } from "./kernel-reply.js";
import type { KernelRequest } from "./kernel-request.js";
import { array, number, object, requireKernel, text } from "./kernel-values.js";

/** Validate the wire result before geometry, correspondence or measurements escape the adapter. */
export function readKernelReply<Input extends KernelRequest>(
  input: Input,
  value: unknown,
): KernelReply<Input> {
  const reply = object(value);
  switch (input.kind) {
    case "fit-mesh": {
      validateKernelBodies(reply, input);
      requireKernel(
        array(reply.results).length === 1 && array(reply.participants).length === 0,
        "fitted solid count",
      );
      const fit = object(reply.fit);
      if (!("layout" in input)) {
        const errors = array(fit.vertexErrors);
        requireKernel(errors.length === input.mesh.vertices.length, "mesh deviation count");
        for (const error of errors)
          requireKernel(
            number(error) >= 0 && number(error) <= input.tolerance,
            "mesh vertex deviation",
          );
      }
      for (const key of ["patches", "controlPoints", "samples"]) {
        const n = number(fit[key]);
        requireKernel(Number.isInteger(n) && n > 0, "mesh fit counts");
      }
      requireKernel(number(fit.patches) <= (input.maxPatches ?? 256), "fit patch budget");
      for (const key of ["sampledSurfaceToMesh", "sampledMeshToSurface", "sampledRms"])
        requireKernel(
          number(fit[key]) >= 0 && number(fit[key]) <= input.tolerance,
          "mesh fit deviation",
        );
      requireKernel(
        number(fit.sampledSeamAngle) >= 0 &&
          number(fit.sampledSeamAngle) <= (input.smoothAngle ?? 5),
        "mesh fit seam angle",
      );
      break;
    }
    case "project":
    case "offset-sketch":
      validateKernelCurves(reply.curves);
      break;
    case "measure":
      validateKernelMeasurement(reply.measurement);
      break;
    case "topology":
      validateKernelTopology(reply.topology, input);
      break;
    case "sections":
      for (const value of array(reply.sections)) {
        const section = object(value);
        requireKernel(
          input.bodies.some((body) => body.id === text(section.body)),
          "section body",
        );
        validateKernelCurves(section.curves);
      }
      break;
    case "edge-finish-selection": {
      const seen = new Set<string>();
      for (const value of array(reply.edgeSelection)) {
        const edge = object(value);
        const body = input.bodies.find((body) => body.id === text(edge.body));
        requireKernel(
          body?.edges.some((candidate) => candidate.id === text(edge.edge)),
          "selected edge",
        );
        const key = JSON.stringify([edge.body, edge.edge]);
        requireKernel(!seen.has(key), "duplicate selected edge");
        seen.add(key);
      }
      break;
    }
    default:
      validateKernelBodies(reply, input);
  }
  return reply as KernelReply<Input>;
}
