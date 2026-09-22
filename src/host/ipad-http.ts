import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import type { IncomingMessage, ServerResponse } from "node:http";
import { extname, resolve, sep } from "node:path";

const types: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css",
  ".wasm": "application/wasm",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".woff2": "font/woff2",
};
/** Only built frontend assets are public. Document/host access requires the paired socket. */
export async function serveIPad(root: string, request: IncomingMessage, response: ServerResponse) {
  response.setHeader("Cache-Control", "no-store");
  response.setHeader("X-Content-Type-Options", "nosniff");
  response.setHeader("Referrer-Policy", "no-referrer");
  response.setHeader("Content-Security-Policy", "frame-ancestors 'none'");
  if (request.method !== "GET" && request.method !== "HEAD") {
    response.writeHead(405).end();
    return;
  }
  try {
    const pathname = decodeURIComponent(new URL(request.url ?? "/", "http://localhost").pathname);
    const path = resolve(root, `.${pathname === "/" ? "/index.html" : pathname}`);
    if (!path.startsWith(resolve(root) + sep) || !(await stat(path)).isFile()) {
      response.writeHead(404).end();
      return;
    }
    response.setHeader("Content-Type", types[extname(path)] ?? "application/octet-stream");
    if (request.method === "HEAD") response.end();
    else
      createReadStream(path)
        .on("error", () => response.destroy())
        .pipe(response);
  } catch {
    response.writeHead(404).end();
  }
}
