import assert from "node:assert/strict";
import test from "node:test";
import {
  initializeDecoratorRuntime,
  runDecoratorHook,
} from "../src/decorators/javascript-runtime.js";

test("self-contained decorator modules exchange JSON without host capabilities or shared state", async () => {
  const runtime = await initializeDecoratorRuntime();
  const source = `let calls = 0; export default { generate(input) {
    return { doubled: input.value * 2, calls: ++calls,
      host: [typeof fetch, typeof process, typeof require, typeof window, typeof XMLHttpRequest] };
  } };`;
  const expected = { doubled: 6, calls: 1, host: Array(5).fill("undefined") };
  assert.deepEqual(runDecoratorHook(runtime, source, "generate", { value: 3 }), expected);
  assert.deepEqual(runDecoratorHook(runtime, source, "generate", { value: 3 }), expected);
});

test("decorator execution rejects imports, asynchronous output and runaway code, then recovers", async () => {
  const runtime = await initializeDecoratorRuntime();
  assert.throws(() =>
    runDecoratorHook(
      runtime,
      'import x from "https://example.com/code.js"; export default { generate() { return x; } };',
      "generate",
      {},
    ),
  );
  assert.throws(
    () =>
      runDecoratorHook(
        runtime,
        "export default { async generate() { return 1; } };",
        "generate",
        {},
      ),
    /synchronously/,
  );
  assert.throws(
    () =>
      runDecoratorHook(
        runtime,
        "export default { generate() { while (true) {} } };",
        "generate",
        {},
        20,
      ),
    /interrupted/,
  );
  assert.equal(
    runDecoratorHook(runtime, "export default { generate() { return 7; } };", "generate", {}),
    7,
  );
});
