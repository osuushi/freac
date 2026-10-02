import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";
import { agentDecoratorRoute } from "./agent-decorator-route.mjs";
import { scriptBrowser } from "./agent-script-browser.mjs";
import { launchElectron } from "./native-documents.mjs";
import { settled } from "./ui-helpers.mjs";
import { runtimeNames } from "./ui-runtime.mjs";

const [name] = runtimeNames(undefined, ["electron"]);
let app,
  web,
  page,
  workspace,
  counter = 0;
try {
  if (name === "electron") {
    app = await launchElectron({
      args: ["."],
      env: { ...process.env, MAKESHIFT_TEST_HIDDEN: "1" },
    });
    page = await app.firstWindow();
    await page.evaluate(() =>
      window.makeshiftAgent.request({
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
    workspace = (await page.evaluate(() => window.makeshiftAgent.request({ kind: "read" })))
      .workspace;
  } else {
    web = await scriptBrowser(name);
    ({ page, workspace } = web);
  }
  page.setDefaultTimeout(20000);
  await settled(page);
  await assert.rejects(
    () => run('await makeshift.editDecorator({action:"settings",ids:[],patch:{pitch:[]}});'),
    /typecheck failed/,
  );
  await agentDecoratorRoute(page, run, app ? command : undefined);
  console.log(`PASS ${name}: decorator script transport and standalone type declarations`);
} finally {
  if (app) {
    await page.evaluate(() => window.makeshiftAgent.request({ kind: "stop" })).catch(() => {});
    await app.close();
  }
  await web?.close();
}

async function run(source) {
  const prefix = `decorators-${++counter}`;
  await writeFile(join(workspace, `${prefix}.ts`), source);
  return command(`run ${prefix}.ts`);
}

async function command(input) {
  const prefix = `command-${++counter}`;
  if (web) {
    try {
      const { stdout } = await promisify(execFile)(web.env.MAKESHIFT_CLI, input.split(" "), {
        cwd: workspace,
        env: web.env,
        timeout: 30000,
      });
      await settled(page);
      return JSON.parse(stdout);
    } catch (error) {
      throw new Error(error.stderr || error.message);
    }
  }
  await page.locator(".agent-screen textarea").focus();
  await page.keyboard.type(
    `makeshift ${input} > ${prefix}.json 2> ${prefix}.err; printf '%s' "$?" > ${prefix}.done`,
  );
  await page.keyboard.press("Enter");
  for (let i = 0; i < 1000; i++) {
    const code = await readFile(join(workspace, `${prefix}.done`), "utf8").catch(() => "");
    if (code) {
      if (code !== "0") throw new Error(await readFile(join(workspace, `${prefix}.err`), "utf8"));
      await settled(page);
      return JSON.parse(await readFile(join(workspace, `${prefix}.json`), "utf8"));
    }
    await new Promise((resolve) => setTimeout(resolve, 30));
  }
  throw new Error("Decorator script CLI did not finish");
}
