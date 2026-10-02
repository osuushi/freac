import { randomUUID } from "node:crypto";
import { access, readFile, rename, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { setTimeout } from "node:timers/promises";
import type { ScriptRequest } from "../agent-script/api.js";
import { responseGraceMs, scriptTimeoutMs } from "../model/calculation-limits.js";

export async function request(
  command: string,
  entity?: string,
  script?: ScriptRequest,
): Promise<unknown> {
  const directory = process.env.MAKESHIFT_ENDPOINT ?? process.env.FREAC_ENDPOINT;
  const capability = process.env.MAKESHIFT_CAPABILITY ?? process.env.FREAC_CAPABILITY;
  if (!directory || !capability)
    throw new Error("Run makeshift inside the drawing's Agent terminal.");
  const base = join(directory, randomUUID());
  try {
    await writeFile(`${base}.tmp`, JSON.stringify({ capability, command, entity, script }), {
      flag: "wx",
      mode: 0o600,
    });
    await rename(`${base}.tmp`, `${base}.request`);
    const control = command === "script" && ["poll", "cancel"].includes(script?.action ?? "");
    const duration =
      command === "status" || control ? responseGraceMs : scriptTimeoutMs + responseGraceMs;
    const deadline = performance.now() + duration;
    while (performance.now() < deadline) {
      await setTimeout(30);
      try {
        const reply = JSON.parse(await readFile(`${base}.response`, "utf8"));
        if (reply.error) throw new Error(reply.error);
        if (!reply.result) throw new Error("Invalid Makeshift response.");
        return reply.result;
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
        // A closed channel is different from a still-running calculation.
        await access(directory);
      }
    }
    throw new Error("Makeshift did not respond. Restart Agent in the drawing.");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT")
      throw new Error("This Makeshift connection has closed. Restart Agent in the drawing.");
    if (["EPERM", "EACCES"].includes((error as NodeJS.ErrnoException).code ?? ""))
      throw new Error(
        "Makeshift status needs access to its temporary connection directory. Use the harness's workspace-write permissions; keep its sandbox enabled.",
      );
    throw error;
  } finally {
    await Promise.all(
      ["tmp", "request", "response"].map((suffix) =>
        rm(`${base}.${suffix}`, { force: true }).catch(() => {}),
      ),
    );
  }
}
