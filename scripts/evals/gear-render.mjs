// The image available to an agent must contain the same gear preview as the UI.
import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { scriptBrowser } from "../../tests/agent-script-browser.mjs";
import { orient } from "../../tests/ui-blend-edit.mjs";
import { inspect } from "../../tests/ui-helpers.mjs";
import { revisionFixture } from "./gear-cases.mjs";
import { gearSession, run } from "./gear-session.mjs";

async function tealPixels(page, png) {
  return page.evaluate(async (base64) => {
    const image = new Image();
    image.src = `data:image/png;base64,${base64}`;
    await image.decode();
    const canvas = document.createElement("canvas");
    canvas.width = image.width;
    canvas.height = image.height;
    const context = canvas.getContext("2d");
    context.drawImage(image, 0, 0);
    const data = context.getImageData(0, 0, canvas.width, canvas.height).data;
    let count = 0;
    for (let i = 0; i < data.length; i += 4)
      if (data[i + 1] - data[i] > 25 && data[i + 2] - data[i + 1] < 30) count++;
    return count;
  }, png.toString("base64"));
}

const name = process.env.MAKESHIFT_TEST_BROWSER ?? "electron";
const session = name === "electron" ? await gearSession() : await scriptBrowser(name);
try {
  const { page, workspace } = session;
  await inspect(page);
  const cli =
    session.cli ??
    (async (...args) =>
      JSON.parse(
        (
          await run(session.env.MAKESHIFT_CLI, args, {
            env: session.env,
            cwd: workspace,
            timeout: 30000,
          })
        ).stdout,
      ));
  await writeFile(join(workspace, "gears.ts"), revisionFixture);
  await cli("run", "gears.ts");
  if (name === "electron")
    await page.getByRole("button", { name: "Collapse agent terminal" }).click();
  await orient(page, [0, -1, 0.4]);
  let visible = 0;
  const deadline = Date.now() + 15000;
  while (visible < 1000 && Date.now() < deadline)
    visible = await tealPixels(page, await page.screenshot());
  assert(visible >= 1000, `UI must contain the gear preview: ${visible} teal pixels`);
  const before = await inspect(page);
  const image =
    name === "electron"
      ? await readFile((await cli("render")).path)
      : Buffer.from(
          (await page.evaluate(() => window.scriptInspection(true))).image.data.split(",")[1],
          "base64",
        );
  const captured = await tealPixels(page, image);
  assert(
    captured >= 1000,
    `Agent capture lost decorated teeth: ${captured} teal pixels (UI ${visible})`,
  );
  const after = await inspect(page);
  assert.deepEqual(after.document, before.document);
  assert.deepEqual(after.camera, before.camera);
  assert.deepEqual(after.modelingSelection, before.modelingSelection);
  console.log(
    `PASS ${name} agent gear image: ${captured} teal pixels; model/camera/selection preserved`,
  );
} finally {
  await session.close();
}
