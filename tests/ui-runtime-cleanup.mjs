import assert from "node:assert/strict";
import { runtimeNames, withUiRuntimes } from "./ui-runtime.mjs";

for (const name of runtimeNames()) {
  let context, url, ownedPage;
  await assert.rejects(
    withUiRuntimes(
      async (page) => {
        context = page.context();
        ownedPage = page;
        url = page.url();
        throw new Error("Intentional route failure");
      },
      { allowed: [name] },
    ),
    /Intentional route failure/,
  );
  assert.equal(ownedPage.isClosed(), true);
  assert.deepEqual(context.pages(), []);
  if (context.browser()) assert.equal(context.browser().isConnected(), false);
  await assert.rejects(fetch(url));
  console.log(`${name}: failed route closed its browser/app and local server`);
}
