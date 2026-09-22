import { mkdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import type { PortableFiles } from "../model/portable-files.js";
import { safeWrite } from "./safe-write.js";

/** Only local configuration and auth move between local homes; neither is archived. */
export async function copyCodexLocalState(from: string, to: string): Promise<void> {
  await mkdir(to, { recursive: true, mode: 0o700 });
  for (const name of ["config.toml", "auth.json"]) {
    try {
      await safeWrite(join(to, name), await readFile(join(from, name)), 0o600);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
  }
}

/** Resume by recorded UUID, not by the old machine's working-directory index. */
export function codexResumeArgs(files: PortableFiles, cwd: string): string[] {
  let latest: { id: string; timestamp: string } | null = null;
  for (const [path, bytes] of Object.entries(files)) {
    if (!path.startsWith("conversations/codex/sessions/")) continue;
    const newline = bytes.indexOf(10);
    const line = new TextDecoder().decode(bytes.subarray(0, newline < 0 ? bytes.length : newline));
    try {
      const record = JSON.parse(line);
      const id = record.payload?.id;
      if (
        record.type !== "session_meta" ||
        record.payload?.source !== "cli" ||
        typeof id !== "string" ||
        !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)
      )
        continue;
      let timestamp = typeof record.timestamp === "string" ? record.timestamp : "";
      // Resuming an older chat makes it current without changing its creation timestamp.
      const tail = new TextDecoder().decode(bytes.subarray(Math.max(0, bytes.length - 65536)));
      for (const line of tail.split("\n")) {
        try {
          const entry = JSON.parse(line);
          if (typeof entry.timestamp === "string" && entry.timestamp > timestamp)
            timestamp = entry.timestamp;
        } catch {
          /* An in-progress final line is retained but cannot select a newer chat. */
        }
      }
      if (!latest || timestamp > latest.timestamp) latest = { id, timestamp };
    } catch {
      /* Preserve unfamiliar records byte-for-byte, but do not infer a resume ID. */
    }
  }
  return latest ? ["resume", latest.id, "--cd", cwd] : [];
}
