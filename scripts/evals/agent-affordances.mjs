// Ad hoc model experiment. Deliberately absent from package scripts and CI.
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { promisify } from "node:util";
import { startupGuide } from "../../.build/host/agent-cli/startup-guide.js";
import { launchGuidance, orientationOverrides } from "../../.build/host/host/agent-orientation.js";
import { launchElectron } from "../../tests/native-documents.mjs";

const run = promisify(execFile);
const model = process.env.FREAC_EVAL_MODEL ?? "gpt-6-luna";
const effort = process.env.FREAC_EVAL_EFFORT ?? "low";
const output = resolve(process.env.FREAC_EVAL_OUTPUT ?? ".cache/agent-eval");
await mkdir(output, { recursive: true });
const baseline = (
  await run("git", [
    "show",
    "7e135e671a1d23e305ba8fe0cf8a5d43ebc58660:src/host/agent-orientation.ts",
  ])
).stdout;
const expression = baseline.match(/export const launchGuidance =([\s\S]*?);\n/)[1];
const oldLaunch = Function(`return (${expression})`)();
const app = await launchElectron({ args: ["."], env: { ...process.env, FREAC_TEST_HIDDEN: "1" } });
const results = [];
try {
  const page = await app.firstWindow();
  await page.evaluate(() =>
    window.freacAgent.request({
      kind: "configure",
      preferences: {
        preset: "custom",
        executable: "/bin/sh",
        args: ["-i"],
        env: {},
      },
    }),
  );
  await page.getByRole("button", { name: "Open agent terminal" }).click();
  await page.locator(".agent-status").filter({ hasText: "Running" }).waitFor();
  const workspace = (await page.evaluate(() => window.freacAgent.request({ kind: "read" })))
    .workspace;
  await page.locator(".agent-screen textarea").focus();
  await page.keyboard.type(
    'printf "%s\\n" "$FREAC_CLI" "$FREAC_ENDPOINT" "$FREAC_CAPABILITY" "$FREAC_DOCS" "$FREAC_API_TYPES" "$FREAC_WORKSPACE" "$PATH" > eval-env.txt',
  );
  await page.keyboard.press("Enter");
  let values;
  for (let i = 0; i < 100; i++) {
    try {
      values = (await readFile(join(workspace, "eval-env.txt"), "utf8")).trimEnd().split("\n");
    } catch {}
    if (values?.length === 7) break;
    await new Promise((r) => setTimeout(r, 50));
  }
  assert.equal(values?.length, 7);
  const keys = [
    "FREAC_CLI",
    "FREAC_ENDPOINT",
    "FREAC_CAPABILITY",
    "FREAC_DOCS",
    "FREAC_API_TYPES",
    "FREAC_WORKSPACE",
    "PATH",
  ];
  const env = { ...process.env, ...Object.fromEntries(keys.map((k, i) => [k, values[i]])) };
  const cli = async (...args) =>
    JSON.parse((await run(env.FREAC_CLI, args, { env, cwd: workspace })).stdout);
  await writeFile(
    join(workspace, "fixture.ts"),
    `
for (const [x, radius] of [[0, 2], [30, 8]]) {
 const s = await freac.createSketch({plane:"XY",curves:[{kind:"circle",center:{x,y:0},radius}]});
 await freac.extrude({sources:s.profiles,distance:10,mode:"new"});
}`,
  );
  await cli("run", "fixture.ts");
  const faces = (await cli("faces")).faces;
  const cases = [
    { name: "all", prompt: "Select all the cylindrical faces.", radius: Infinity },
    { name: "radius", prompt: "Select all cylindrical faces with radius below 5 mm.", radius: 5 },
  ];
  // Hold the current API and front-loaded workspace card constant to isolate launch wording.
  for (const [variant, guidance] of [
    ["old-launch", oldLaunch],
    ["new-launch", launchGuidance],
  ]) {
    for (const task of cases) {
      await cli("select", "--clear");
      await writeFile(join(workspace, "AGENTS.md"), startupGuide);
      const expected = faces
        .filter((f) => f.surface === "cylinder" && f.cylinder.radius < task.radius)
        .map((f) => f.id)
        .sort();
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
        ...orientationOverrides(env),
        "-c",
        `developer_instructions=${JSON.stringify(guidance)}`,
        "-C",
        workspace,
        task.prompt,
      ];
      console.log(`Starting ${variant}: ${task.name} (${model}, ${effort})`);
      const start = performance.now();
      let stdout = "",
        error = null;
      try {
        const execution = run(process.env.FREAC_CODEX_EXECUTABLE ?? "codex", args, {
          env,
          cwd: workspace,
          timeout: 180000,
          maxBuffer: 8 * 1024 * 1024,
        });
        // exec reads piped stdin even when the prompt is supplied as an argument.
        execution.child.stdin.end();
        stdout = (await execution).stdout;
      } catch (e) {
        stdout = e.stdout ?? "";
        error = e.stderr?.slice(-2000) || e.message;
      }
      const elapsed = Math.round(performance.now() - start);
      await writeFile(join(output, `${variant}-${task.name}.jsonl`), stdout);
      const events = stdout.split("\n").flatMap((line) => {
        try {
          return [JSON.parse(line)];
        } catch {
          return [];
        }
      });
      const commands = events
        .filter((e) => e.type === "item.completed" && e.item?.type === "command_execution")
        .map((e) => e.item.command);
      const final = events
        .filter((e) => e.type === "item.completed" && e.item?.type === "agent_message")
        .map((e) => e.item.text);
      const actual = (await cli("context")).context.selection.map((t) => t.face).sort();
      const result = {
        variant,
        task: task.prompt,
        model,
        effort,
        elapsedMs: elapsed,
        passed: !error && JSON.stringify(actual) === JSON.stringify(expected),
        commands,
        final,
        error,
      };
      results.push(result);
      await writeFile(join(output, "results.json"), JSON.stringify(results, null, 2));
      console.log(JSON.stringify(result));
      if (error)
        throw new Error("Model execution failed; recorded diagnostic, stopping experiment.");
    }
  }
} finally {
  const page = await app.firstWindow();
  await page.evaluate(() => window.freacAgent.request({ kind: "stop" })).catch(() => {});
  await app.close();
}
