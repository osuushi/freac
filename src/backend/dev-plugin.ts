import type { Plugin } from "vite";
import type { ModelRequest } from "../sketch/model-api.js";
import { DocumentOwner } from "./document-owner.js";

// Browser development/testing uses the same owner/calculator as Electron.
// This localhost-only endpoint is not a deployed remote hosting implementation.
export function sketchBackend(): Plugin {
  let owner: DocumentOwner | undefined;
  return {
    name: "freac-sketch-backend",
    configureServer(server) {
      owner = new DocumentOwner();
      server.middlewares.use("/sketch-api", async (request, response) => {
        if (
          request.method !== "POST" ||
          request.headers["content-type"] !== "application/json" ||
          (request.headers.origin && request.headers.origin !== `http://${request.headers.host}`)
        ) {
          response.statusCode = 403;
          response.end();
          return;
        }
        try {
          let body = "";
          for await (const chunk of request) {
            body += chunk;
            if (body.length > 2_000_000) throw new Error("Sketch request too large");
          }
          const result = await owner?.call(JSON.parse(body) as ModelRequest);
          response.setHeader("Content-Type", "application/json");
          response.end(JSON.stringify(result));
        } catch {
          response.statusCode = 400;
          response.end("Invalid sketch request");
        }
      });
      server.httpServer?.once("close", () => owner?.close());
    },
    closeBundle() {
      owner?.close();
    },
  };
}
