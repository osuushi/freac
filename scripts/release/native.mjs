import { execFileSync } from "node:child_process";
import { closeSync, openSync } from "node:fs";
import { cp, mkdir, realpath } from "node:fs/promises";
import { basename, join, resolve } from "node:path";

const run = (command, args) => execFileSync(command, args, { encoding: "utf8" });
const system = (path) => path.startsWith("/usr/lib/") || path.startsWith("/System/Library/");
export function inspectMachO(file, flag) {
  // otool treats trailing parentheses in Electron helper names as archive members.
  const fd = openSync(file, "r");
  try {
    return execFileSync("otool", [flag, "/dev/fd/3"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe", fd],
    });
  } finally {
    closeSync(fd);
  }
}
export function dependencies(file) {
  return inspectMachO(file, "-L")
    .split("\n")
    .slice(1)
    .map((line) => line.trim().split(" (compatibility")[0])
    .filter(Boolean);
}
export async function bundleNative(destination, sdk) {
  await mkdir(destination, { recursive: true });
  const copied = new Map();
  async function copyLibrary(path) {
    const canonical = await realpath(path);
    const name = basename(canonical);
    if (copied.has(name)) {
      if (copied.get(name) !== canonical) throw new Error(`Conflicting native library: ${name}`);
      return name;
    }
    copied.set(name, canonical);
    const target = join(destination, name);
    await cp(canonical, target);
    await relocate(target);
    run("install_name_tool", ["-id", `@loader_path/${name}`, target]);
    return name;
  }
  async function relocate(file) {
    const id = run("otool", ["-D", file]).split("\n")[1]?.trim();
    for (const dependency of dependencies(file)) {
      if (dependency === id || system(dependency)) continue;
      // OCCT installs @rpath references; resolve them only from the selected SDK.
      const original = dependency.startsWith("@rpath/")
        ? join(sdk, "lib", dependency.slice(7))
        : dependency;
      if (!original.startsWith("/")) throw new Error(`Unresolved dependency ${dependency}`);
      const name = await copyLibrary(original);
      run("install_name_tool", ["-change", dependency, `@loader_path/${name}`, file]);
    }
    // Remove build-machine rpaths. All bundled dependencies are loader-relative.
    const paths = [
      ...run("otool", ["-l", file]).matchAll(
        /cmd LC_RPATH\n\s+cmdsize \d+\n\s+path (.+?) \(offset/g,
      ),
    ];
    for (const [, path] of paths) run("install_name_tool", ["-delete_rpath", path, file]);
  }
  for (const component of ["solver", "kernel"]) {
    const name = `freac-${component}`;
    const target = join(destination, name);
    await cp(resolve(`.build/${component}/bin/${name}`), target);
    await relocate(target);
  }
  // Relocation invalidates original signatures, including arm64 ad-hoc signatures.
  for (const name of [...copied.keys(), "freac-solver", "freac-kernel"])
    run("codesign", ["--force", "--sign", "-", join(destination, name)]);
}
