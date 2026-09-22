import { chmod } from "node:fs/promises";
import { fileURLToPath } from "node:url";

// node-pty 1.1.0 ships a non-executable macOS helper in its npm archive.
if (process.platform === "darwin") {
  const helper = new URL(
    `../node_modules/node-pty/prebuilds/darwin-${process.arch}/spawn-helper`,
    import.meta.url,
  );
  await chmod(fileURLToPath(helper), 0o755);
}
