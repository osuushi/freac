import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { NativeCalculator } from "../.cache/sketch-tests/src/backend/native-calculator.js";

const captured = JSON.parse(await readFile("tests/fixtures/slow-face-delete.json", "utf8"));
const shell = JSON.parse(await readFile("tests/fixtures/shell-cylindrical-splines.json", "utf8"));
const cases = [
  [
    "captured-delete",
    {
      kind: "delete-topology",
      bodies: captured.document.bodies,
      selection: [
        { body: captured.document.bodies[0].id, whole: false, faces: [captured.face], edges: [] },
      ],
    },
  ],
  [
    "shell-open",
    {
      kind: "shell",
      bodies: shell.document.bodies,
      selection: [{ body: shell.document.bodies[0].id, faces: [shell.opening] }],
      thickness: -4,
    },
  ],
  [
    "shell-closed",
    {
      kind: "shell",
      bodies: shell.document.bodies,
      selection: [{ body: shell.document.bodies[0].id, faces: [] }],
      thickness: -4,
    },
  ],
];
for (const threads of [1, 2, 4]) {
  process.env.FREAC_KERNEL_THREADS = String(threads);
  const kernel = new NativeCalculator(
    resolve(process.argv[2] ?? ".build/kernel/bin/freac-kernel"),
    "Kernel benchmark",
  );
  try {
    for (const [name, input] of cases) {
      const samples = [];
      let outcome;
      for (let i = 0; i < (name === "captured-delete" ? 1 : 4); i++) {
        const start = performance.now();
        try {
          const reply = await kernel.calculate(input);
          outcome = { volume: reply.results.reduce((sum, r) => sum + r.volume, 0) };
        } catch (error) {
          outcome = { error: error.message };
        }
        if (i > 0 || name === "captured-delete")
          samples.push(Math.round(performance.now() - start));
      }
      console.log(JSON.stringify({ threads, name, milliseconds: samples, ...outcome }));
    }
  } finally {
    kernel.close();
    await kernel.cancel();
  }
}
