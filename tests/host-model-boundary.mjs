import assert from "node:assert/strict";

export async function hostModelBoundary(page) {
  const result = await page.evaluate(async () => {
    const before = await window.makeshiftModel({ kind: "read" });
    const status = await window.makeshiftDocument.status();
    const errors = [];
    for (const request of [
      { kind: "new" },
      { kind: "open", document: { units: "mm", sketches: [] } },
      null,
      [],
      { kind: "toString" },
    ]) {
      try {
        await window.makeshiftModel(request);
        errors.push(null);
      } catch (error) {
        errors.push(error.message);
      }
    }
    return {
      before,
      status,
      errors,
      after: await window.makeshiftModel({ kind: "read" }),
      afterStatus: await window.makeshiftDocument.status(),
    };
  });
  assert.match(result.errors[0], /Use document commands/);
  assert.match(result.errors[1], /Use document commands/);
  assert.ok(result.errors.slice(2).every((error) => /model request/.test(error)));
  assert.deepEqual(
    result.after,
    result.before,
    "rejected raw replacement preserves geometry and history",
  );
  assert.deepEqual(
    result.afterStatus,
    result.status,
    "rejected raw replacement preserves file identity and baseline",
  );
}
