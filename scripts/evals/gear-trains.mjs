// Ad hoc paid/model evaluation, deliberately outside CI. Run after build + test compilation.
import { createHash } from "node:crypto";
import { createWriteStream } from "node:fs";
import { cp, mkdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { orientationOverrides } from "../../.build/host/host/agent-orientation.js";
import { personalSkillOverrides } from "../../.build/host/host/agent-settings.js";
import { saveDocument } from "../../tests/native-documents.mjs";
import { inspect } from "../../tests/ui-helpers.mjs";
import { cases, revisionFixture } from "./gear-cases.mjs";
import { gearSession, run } from "./gear-session.mjs";

const model = process.env.MAKESHIFT_EVAL_MODEL ?? "gpt-6-astra";
const effort = process.env.MAKESHIFT_EVAL_EFFORT ?? "low";
const variant =
  process.env.MAKESHIFT_EVAL_VARIANT ?? (process.env.MAKESHIFT_EVAL_SKILL ? "skill" : "baseline");
const output = resolve(
  process.env.MAKESHIFT_EVAL_OUTPUT ?? `.cache/gear-eval/${Date.now()}-${variant}`,
);
const names = (process.env.MAKESHIFT_EVAL_CASES ?? "pair,compound,revision").split(",");
const hash = (s) => createHash("sha256").update(s).digest("hex");
await mkdir(output, { recursive: true });
for (const name of names) {
  const task = cases[name];
  if (!task) throw new Error(`Unknown case ${name}`);
  const directory = join(output, name);
  await mkdir(directory, { recursive: true });
  const session = await gearSession();
  const { page, workspace, env, cli } = session;
  try {
    if (task.fixture) {
      await writeFile(join(workspace, "fixture.ts"), revisionFixture);
      await cli("run", "fixture.ts");
      await writeFile(
        join(directory, "before.json"),
        JSON.stringify((await inspect(page)).document),
      );
    }
    let prompt = task.prompt;
    if (process.env.MAKESHIFT_EVAL_SKILL) {
      const skill = join(workspace, ".agents/skills/makeshift-gear-trains");
      await cp(resolve(process.env.MAKESHIFT_EVAL_SKILL), skill, { recursive: true });
      prompt +=
        " Use the makeshift-gear-trains skill in .agents/skills/makeshift-gear-trains/SKILL.md.";
    }
    const executable = process.env.MAKESHIFT_CODEX_EXECUTABLE ?? "codex";
    const args = [
      "exec",
      "--ignore-user-config",
      "--ephemeral",
      "--skip-git-repo-check",
      "--json",
      "-s",
      "workspace-write",
      "-m",
      model,
      "-c",
      `model_reasoning_effort="${effort}"`,
      ...(await personalSkillOverrides()),
      ...orientationOverrides(env),
      "-C",
      workspace,
      prompt,
    ];
    const metadata = {
      date: new Date().toISOString(),
      name,
      variant,
      model,
      effort,
      prompt,
      commit: (await run("git", ["rev-parse", "HEAD"])).stdout.trim(),
      cliVersion: (await run(executable, ["--version"])).stdout.trim(),
      guideHash: hash(await readFile(env.MAKESHIFT_DOCS)),
      typesHash: hash(await readFile(env.MAKESHIFT_API_TYPES)),
      skillHash: process.env.MAKESHIFT_EVAL_SKILL
        ? hash(await readFile(join(process.env.MAKESHIFT_EVAL_SKILL, "SKILL.md")))
        : null,
    };
    await writeFile(join(directory, "metadata.json"), JSON.stringify(metadata, null, 2));
    console.log(`Starting ${variant}/${name} (${model}/${effort}) — ${directory}`);
    const start = performance.now();
    let stdout = "",
      error = null;
    try {
      const execution = run(executable, args, {
        env,
        cwd: workspace,
        timeout: 600000,
        maxBuffer: 32 * 1024 * 1024,
      });
      execution.child.stdout.pipe(createWriteStream(join(directory, "live.jsonl")));
      execution.child.stdin.end();
      stdout = (await execution).stdout;
    } catch (e) {
      stdout = e.stdout ?? "";
      error = e.stderr?.slice(-2000) || e.message;
    }
    await writeFile(join(directory, "trace.jsonl"), stdout);
    const events = stdout.split("\n").flatMap((line) => {
      try {
        return [JSON.parse(line)];
      } catch {
        return [];
      }
    });
    const result = {
      ...metadata,
      elapsedMs: Math.round(performance.now() - start),
      error,
      commands: events
        .filter((e) => e.type === "item.completed" && e.item?.type === "command_execution")
        .map((e) => ({ command: e.item.command, exitCode: e.item.exit_code })),
      final: events
        .filter((e) => e.type === "item.completed" && e.item?.type === "agent_message")
        .map((e) => e.item.text),
      usage: events.filter((e) => e.type === "turn.completed").map((e) => e.usage),
    };
    await writeFile(join(directory, "result.json"), JSON.stringify(result, null, 2));
    await writeFile(
      join(directory, "document.json"),
      JSON.stringify((await inspect(page)).document),
    );
    // Persist authored scripts and notes, excluding endpoint capabilities.
    await cp(workspace, join(directory, "workspace"), {
      recursive: true,
      filter: (path) => !path.endsWith("eval-env.txt"),
    });
    await saveDocument(page, join(directory, "model.makeshift"));
    await page.screenshot({ path: join(directory, "screen.png") });
    console.log(
      `${name}: ${result.elapsedMs} ms, ${result.commands.length} commands, error=${error}`,
    );
    if (error) throw new Error("Model execution failed; diagnostics saved.");
  } finally {
    await session.close();
  }
}
console.log(`Results: ${output}`);
