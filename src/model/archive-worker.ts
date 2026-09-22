import { readPortableArchive, writePortableArchive } from "./portable-archive.js";
import type { PortableFiles } from "./portable-files.js";
export type ArchiveWork =
  | { kind: "read"; bytes: Uint8Array }
  | { kind: "write"; model: string; files: PortableFiles };
self.onmessage = (event: MessageEvent<ArchiveWork>) => {
  try {
    const work = event.data;
    self.postMessage({
      result:
        work.kind === "read"
          ? readPortableArchive(work.bytes)
          : writePortableArchive(work.model, work.files),
    });
  } catch (error) {
    self.postMessage({ error: String(error) });
  }
};
