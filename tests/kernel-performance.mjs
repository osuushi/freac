import { resolve } from "node:path";
import { materialize } from "../.cache/sketch-tests/src/backend/kernel-result.js";
import { NativeCalculator } from "../.cache/sketch-tests/src/backend/native-calculator.js";

const kernel = new NativeCalculator(
  resolve(
    process.argv[2] ??
      `.build/kernel/bin/freac-kernel${process.platform === "win32" ? ".exe" : ""}`,
  ),
  "benchmark",
);
const square = (x, y, size) => ({
  outer: [
    [x, y, 0],
    [x + size, y, 0],
    [x + size, y + size, 0],
    [x, y + size, 0],
  ].map((a, i, points) => ({ kind: "line", a, b: points[(i + 1) % 4] })),
  holes: [],
});
let bodies = [];
try {
  for (let i = 0; i < 5; i++)
    bodies = materialize(
      bodies,
      await kernel.calculate({
        kind: "extrude",
        normal: [0, 0, 1],
        profiles: [square(i * 30, 0, 20)],
        distance: 10,
        mode: "new",
        bodies,
      }),
    );
  for (const mode of ["new", "auto", "union"]) {
    const samples = [];
    for (let i = 0; i < 16; i++) {
      const start = performance.now();
      await kernel.calculate({
        kind: "extrude",
        normal: [0, 0, 1],
        profiles: [square(10, 5, 20)],
        distance: 5 + i / 2,
        mode,
        bodies,
      });
      if (i > 0) samples.push(performance.now() - start);
    }
    samples.sort((a, b) => a - b);
    console.log(JSON.stringify({ mode, median: samples[7], p95: samples[14] }));
  }
} finally {
  kernel.close();
}
