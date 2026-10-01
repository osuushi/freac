import assert from "node:assert/strict";
import test from "node:test";
import { hostModelRequest } from "../src/host/model-request.js";

test("host model transport reserves replacement for document commands", () => {
  for (const kind of ["new", "open"])
    assert.throws(() => hostModelRequest({ kind }), /Use document commands/);
  for (const value of [null, undefined, [], "read", 1, {}, { kind: "toString" }])
    assert.throws(() => hostModelRequest(value), /model request/);
});
test("host model transport preserves ordinary geometry and history requests", () => {
  for (const kind of [
    "read",
    "read-history",
    "undo",
    "redo",
    "accept",
    "discard",
    "cancel-preview",
  ] as const) {
    const request = { kind };
    assert.equal(hostModelRequest(request), request);
  }
});
