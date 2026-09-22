import { realpath, stat } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { PortableFiles } from "../model/portable-files.js";
import { workspaceSnapshot } from "./workspace-files.js";

/** Import current retained roots, or the first terminal increment's flat directories. */
export async function recoverWorkspaceFiles(
  root: string,
  localHome: string,
): Promise<PortableFiles> {
  const nested = await stat(join(root, "workspace")).catch((error: NodeJS.ErrnoException) => {
    if (error.code === "ENOENT") return null;
    throw error;
  });
  if (nested?.isDirectory()) return workspaceSnapshot(root);
  const files = await workspaceSnapshot(root, true);
  const cwd = await realpath(root);
  const oldConversations = await workspaceSnapshot(dirname(localHome));
  for (const [path, bytes] of Object.entries(oldConversations)) {
    if (!path.startsWith("conversations/")) continue;
    const end = bytes.indexOf(10);
    try {
      const meta = JSON.parse(
        new TextDecoder().decode(bytes.subarray(0, end < 0 ? bytes.length : end)),
      );
      if (
        meta.type === "session_meta" &&
        typeof meta.payload?.cwd === "string" &&
        (await realpath(meta.payload.cwd).catch(() => null)) === cwd
      )
        files[path] = bytes;
    } catch {
      /* Other legacy conversations remain in the local Freac home. */
    }
  }
  return files;
}
