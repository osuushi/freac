import type { Plugin } from "vite";
import { captureFixture } from "./fixture-capture.js";

export function fixtureCapture(): Plugin {
  return {
    name: "freac-development-fixtures",
    configureServer(server) {
      server.middlewares.use("/__freac_fixture", async (request, response) => {
        if (
          request.method !== "POST" ||
          request.headers["content-type"] !== "application/json" ||
          request.headers.origin !== `http://${request.headers.host}`
        ) {
          response.statusCode = 403;
          response.end();
          return;
        }
        try {
          const chunks: Buffer[] = [];
          let bytes = 0;
          for await (const chunk of request) {
            const buffer = Buffer.from(chunk);
            bytes += buffer.length;
            if (bytes > 64 * 1024 * 1024) throw new Error("Fixture exceeds 64 MB");
            chunks.push(buffer);
          }
          const result = await captureFixture(JSON.parse(Buffer.concat(chunks).toString("utf8")));
          response.setHeader("Content-Type", "application/json");
          response.end(JSON.stringify(result));
        } catch (error) {
          response.statusCode = 400;
          response.end(error instanceof Error ? error.message : "Could not capture fixture");
        }
      });
    },
  };
}
