import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { openDocument } from "./native-documents.mjs";
import { inspect, reset } from "./ui-helpers.mjs";
import { chooseTool } from "./ui-tools.mjs";

const fixture = JSON.parse(await readFile("tests/fixtures/shell-cylindrical-splines.json", "utf8"));
// Three independent copies keep the real calculation observable after optimization.
// Only document-local identities change; all BReps remain the captured exact geometry.
const source = fixture.document.bodies[0];
const identities = [source.id, ...source.faces.map((f) => f.id), ...source.edges.map((e) => e.id)];
const document = {
  ...fixture.document,
  bodies: [0, 1, 2].map((index) => {
    const ids = new Map(identities.map((id) => [id, `${index}-${id}`]));
    return JSON.parse(JSON.stringify(source, (_, value) => ids.get(value) ?? value));
  }),
};
export async function shellCalculationRoute(page, name) {
  await reset(page);
  await openDocument(page, {
    name: "shell.freac",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify({ format: "freac", version: 1, document })),
  });
  await page.waitForFunction(() => window.freacInspect().document.bodies?.length === 3);
  const original = (await inspect(page)).document;
  for (let index = 1; index <= 3; index++)
    await page
      .getByRole("button", { name: `Select Body ${index}`, exact: true })
      .click({ modifiers: index > 1 ? ["Shift"] : [] });
  await page.keyboard.press("s");
  const input = page.getByRole("textbox", { name: "Shell thickness", exact: true });
  await input.fill("-4");
  const progress = page.locator(".calculation-progress");
  await progress.waitFor({ state: "visible" });
  assert.match(await progress.textContent(), /Calculating shell/);
  await page.getByRole("button", { name: "Cancel calculation", exact: true }).click();
  let state = await inspect(page);
  assert.equal(state.interaction, null);
  assert.equal(state.preview, null);
  assert.deepEqual(state.document, original);
  assert.equal((await page.evaluate(() => window.freacHistory())).at(-1).outcome, "cancelled");
  // The next real kernel job coalesces typed targets and can still accept exactly once.
  await input.fill("-4");
  await input.fill("-2");
  await input.fill("-1");
  state = await inspect(page);
  assert.ok(state.preview);
  assert.deepEqual(state.document, original);
  assert.equal(await input.inputValue(), "-1");
  await page.keyboard.press("Enter");
  assert.notDeepEqual((await inspect(page)).document, original);
  await chooseTool(page, "undo", "undo");
  assert.deepEqual((await inspect(page)).document, original);
  console.log(
    `${name}: Cancel from focused Shell input, latest typed preview, native restart and one-step Undo pass`,
  );
}
