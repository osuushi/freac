import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { documentArchive, readArchive } from "../src/model/document-archive.js";

test("recognizes a real prototype archive before attempting JSON parsing", () => {
  const archive = readFileSync("tests/fixtures/legacy-archives/legacy-v4-rectangles.bin", "utf8");
  assert.throws(() => readArchive(archive), /older Freac prototype/);
});

test("current document archives retain their round trip", () => {
  const document = { units: "mm" as const, sketches: [] };
  assert.deepEqual(readArchive(documentArchive(document)), document);
});
