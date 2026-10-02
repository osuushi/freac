import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium, webkit } from "playwright";
import { remoteCloseRoute } from "./remote-close-route.mjs";
import { runtimeNames } from "./ui-runtime.mjs";

const names = runtimeNames(["chromium", "webkit"]);
const root = await mkdtemp(join(tmpdir(), "makeshift-remote-close-"));
try {
  for (const name of names)
    for (const command of ["close", "quit"])
      await remoteCloseRoute(
        { chromium, webkit }[name],
        name,
        command,
        join(root, `${name}-${command}.makeshift`),
      );
} finally {
  await rm(root, { recursive: true, force: true });
}
