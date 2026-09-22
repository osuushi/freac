import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { app } from "electron";

/** Electron chooses the installation layout; calculators only receive a path. */
export function nativeExecutable(component: "solver" | "kernel"): string {
  const name = `freac-${component}${process.platform === "win32" ? ".exe" : ""}`;
  return app.isPackaged
    ? join(process.resourcesPath, "native", name)
    : fileURLToPath(new URL(`../../${component}/bin/${name}`, import.meta.url));
}
