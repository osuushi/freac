import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";

/** Diagnostic capture: fixed destination, data only, no document mutation. */
export async function captureFixture(snapshot: unknown, root = process.cwd()) {
  if (!snapshot || typeof snapshot !== "object" || !("document" in snapshot))
    throw new Error("Expected a document snapshot");
  const data = snapshot as { document: unknown; preview?: unknown };
  const capturedAt = new Date().toISOString();
  const directory = resolve(
    root,
    ".cache",
    "fixtures",
    `${capturedAt.replace(/[:.]/g, "-")}-${randomUUID().slice(0, 8)}`,
  );
  await mkdir(directory, { recursive: true });
  const archive = (document: unknown) => JSON.stringify({ format: "freac", version: 1, document });
  await writeFile(
    join(directory, "fixture.json"),
    JSON.stringify({ format: "freac-fixture", version: 1, capturedAt, snapshot }, null, 2),
  );
  await writeFile(join(directory, "accepted.freac"), archive(data.document));
  if (data.preview) await writeFile(join(directory, "preview.freac"), archive(data.preview));
  return { path: join(directory, "fixture.json") };
}
