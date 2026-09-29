import { unzipSync, zipSync } from "three/addons/libs/fflate.module.js";

/** Compare identical 3MF contents; decompression and verification are outside timings. */
export function measureCompression(bytes) {
  const files = unzipSync(bytes);
  const results = [];
  for (let repeat = 0; repeat < 3; repeat++) {
    for (const level of repeat % 2 ? [6, 3, 1, 0] : [0, 1, 3, 6]) {
      const start = performance.now();
      const output = zipSync(files, { level });
      const milliseconds = performance.now() - start;
      const decoded = unzipSync(output);
      if (Object.keys(decoded).length !== Object.keys(files).length)
        throw new Error("Compression changed archive entries");
      for (const [name, input] of Object.entries(files)) {
        const actual = decoded[name];
        if (!actual || actual.length !== input.length || input.some((v, i) => v !== actual[i]))
          throw new Error(`Compression changed ${name}`);
      }
      results.push({ level, repeat, milliseconds, bytes: output.length });
    }
  }
  return results;
}
