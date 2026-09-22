import { randomUUID } from "node:crypto";
import { rename, unlink, writeFile } from "node:fs/promises";
import { basename, dirname, join } from "node:path";

/** Replace only after a complete write in the destination directory. */
export async function safeWrite(
  path: string,
  data: string | Uint8Array,
  mode = 0o666,
): Promise<void> {
  const temporary = join(dirname(path), `.${basename(path)}.${randomUUID()}.tmp`);
  try {
    await writeFile(temporary, data, { flag: "wx", mode });
    await rename(temporary, path);
  } finally {
    await unlink(temporary).catch(() => {});
  }
}
