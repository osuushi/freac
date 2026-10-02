import { mkdir, readFile, realpath } from "node:fs/promises";
import { dirname, join } from "node:path";
import { safeWrite } from "./safe-write.js";

/** Generated application skills are machine-local, outside portable drawing files. */
export async function prepareAgentSkills(home: string, application: string): Promise<void> {
  for (const relative of ["SKILL.md", "references/recovery.md", "scripts/inspect_3mf.py"]) {
    const source = join(application, "agent-skills", "mesh-recovery", relative);
    const destination = join(home, "skills", "makeshift-mesh-recovery", relative);
    await mkdir(dirname(destination), { recursive: true, mode: 0o700 });
    if ((await realpath(dirname(destination))) !== dirname(destination))
      throw new Error("The managed agent skill directory contains a linked path.");
    await safeWrite(destination, await readFile(source), 0o600);
  }
}
