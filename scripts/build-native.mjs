import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

for (const component of ["solver", "kernel"]) {
  const build = resolve(import.meta.dirname, `../.build/${component}`);
  if (!existsSync(resolve(build, "CMakeCache.txt"))) {
    console.error(
      `Native ${component} is not configured. Run npm run ${component === "solver" ? "setup:native" : "setup:kernel"} (see README.md).`,
    );
    process.exit(1);
  }
  const result = spawnSync("cmake", ["--build", build, "--config", "Release", "--parallel", "2"], {
    stdio: "inherit",
  });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}
