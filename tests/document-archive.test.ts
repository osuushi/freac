import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { documentArchive, readArchive, readFileArchive } from "../src/model/document-archive.js";

test("Makeshift writes its name and opens the previous JSON format without rewriting data", () => {
  const document = { units: "mm" as const, sketches: [] };
  const legacy = JSON.stringify({ format: "freac", version: 1, document });
  assert.deepEqual(readArchive(legacy), document);
  assert.equal(JSON.parse(documentArchive(readArchive(legacy))).format, "makeshift");
  assert.throws(() => readArchive(legacy.replace('"freac"', '"unrelated"')), /Unsupported/);
});

test("recognizes a real prototype archive before attempting JSON parsing", () => {
  const archive = readFileSync("tests/fixtures/legacy-archives/legacy-v4-rectangles.bin", "utf8");
  assert.throws(() => readArchive(archive), /older Freac prototype/);
});

test("current document archives retain their round trip", () => {
  const document = { units: "mm" as const, sketches: [] };
  assert.deepEqual(readArchive(documentArchive(document)), document);
  const camera = {
    position: [10, -20, 30] as [number, number, number],
    target: [2, 3, 4] as [number, number, number],
    up: [0, 0, 1] as [number, number, number],
    height: 42,
  };
  assert.deepEqual(readFileArchive(documentArchive(document, camera)), { document, camera });
  assert.deepEqual(readFileArchive(documentArchive(document)), { document });
  assert.throws(
    () =>
      readFileArchive(
        JSON.stringify({
          format: "makeshift",
          version: 1,
          document,
          camera: { ...camera, height: null },
        }),
      ),
    /Invalid saved camera/,
  );
});
