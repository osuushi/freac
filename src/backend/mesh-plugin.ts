import type { Plugin } from "vite";
import { meshWireLimit } from "../model/mesh-wire.js";
import { MeshCalculator } from "./mesh-calculator.js";

export function meshBackend(): Plugin {
  const calculator = new MeshCalculator();
  return {
    name: "freac-mesh-backend",
    configureServer(server) {
      server.middlewares.use("/mesh-export", async (request, response) => {
        if (request.headers.origin && request.headers.origin !== `http://${request.headers.host}`) {
          response.writeHead(403).end();
          return;
        }
        try {
          if (request.method === "GET") {
            response.setHeader("Content-Type", "application/json");
            response.end(JSON.stringify({ native: true }));
          } else if (request.method === "DELETE") {
            await calculator.cancel();
            response.end();
          } else if (
            request.method === "POST" &&
            request.headers["content-type"] === "application/octet-stream"
          ) {
            const chunks: Buffer[] = [];
            let size = 0;
            for await (const chunk of request) {
              size += chunk.length;
              if (size > meshWireLimit) throw new Error("Native export request too large");
              chunks.push(chunk);
            }
            if (response.destroyed) return;
            response.once("close", () => {
              if (!response.writableEnded) void calculator.cancel();
            });
            const output = await calculator.calculate(
              Uint8Array.from(Buffer.concat(chunks)).buffer,
            );
            response.setHeader("Content-Type", "application/octet-stream");
            response.end(Buffer.from(output));
          } else response.writeHead(405).end();
        } catch (error) {
          response.statusCode = 400;
          response.end(error instanceof Error ? error.message : String(error));
        }
      });
      server.httpServer?.once("close", () => calculator.close());
    },
    closeBundle() {
      calculator.close();
    },
  };
}
