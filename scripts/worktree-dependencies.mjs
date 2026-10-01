import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const installArgs = ["ci", "--prefer-offline", "--no-audit"];

export async function dependencyKey(root, config, environment = process.env) {
  const hash = createHash("sha256");
  for (const name of ["package.json", "package-lock.json", ".npmrc"]) {
    hash.update(name);
    hash.update(existsSync(join(root, name)) ? await readFile(join(root, name)) : "absent");
  }
  // Include the setup recipe and local lifecycle helpers, not just their command names.
  const scripts = join(root, "scripts");
  for (const name of (await readdir(scripts, { recursive: true })).sort()) {
    if (!/\.(mjs|sh)$/.test(name)) continue;
    hash.update(name);
    hash.update(await readFile(join(scripts, name)));
  }
  const variables = Object.fromEntries(
    Object.entries(environment)
      .filter(([name]) =>
        /^(npm_config_|NPM_CONFIG_|ELECTRON_|PLAYWRIGHT_|NODE_|CC$|CXX$|CFLAGS$|CXXFLAGS$|CPPFLAGS$|LDFLAGS$|CMAKE_|MACOSX_DEPLOYMENT_TARGET$|PATH$)/.test(
          name,
        ),
      )
      .sort(([a], [b]) => a.localeCompare(b)),
  );
  hash.update(
    JSON.stringify({
      node: process.version,
      abi: process.versions.modules,
      platform: process.platform,
      arch: process.arch,
      config: Object.fromEntries(Object.entries(config).sort(([a], [b]) => a.localeCompare(b))),
      variables,
      installArgs,
    }),
  );
  return hash.digest("hex");
}

function install(root) {
  execFileSync("npm", installArgs, { cwd: root, stdio: "inherit" });
}

function clone(source, destination) {
  // macOS clonefile copies retain independent inodes, permissions and relative symlinks.
  // cp falls back to a normal copy on filesystems without clone support.
  execFileSync("/bin/cp", ["-cR", source, destination], { stdio: "inherit" });
}

async function restore(root, entry, key) {
  try {
    if ((await readFile(join(entry, "complete"), "utf8")) !== key) return false;
  } catch (error) {
    if (error.code === "ENOENT") return false;
    throw error;
  }
  const staging = await mkdtemp(join(root, ".cache/dependencies-restore-"));
  try {
    clone(join(entry, "node_modules"), join(staging, "node_modules"));
    await rm(join(root, "node_modules"), { recursive: true, force: true });
    await rename(join(staging, "node_modules"), join(root, "node_modules"));
  } finally {
    await rm(staging, { recursive: true, force: true });
  }
  return true;
}

async function publish(root, cache, entry, key) {
  const staging = await mkdtemp(join(cache, ".populate-"));
  try {
    clone(join(root, "node_modules"), join(staging, "node_modules"));
    await writeFile(join(staging, "complete"), key);
    try {
      await rename(staging, entry);
    } catch (error) {
      // Another setup may have completed the same installation in the meantime.
      if (!["EEXIST", "ENOTEMPTY"].includes(error.code)) throw error;
    }
  } finally {
    await rm(staging, { recursive: true, force: true });
  }
}

export async function setupDependencies(root, cache) {
  if (process.platform !== "darwin" || process.env.FREAC_DEPENDENCY_CACHE === "0") {
    install(root);
    return "bypass";
  }
  const config = JSON.parse(
    execFileSync("npm", ["config", "list", "--json"], { cwd: root, encoding: "utf8" }),
  );
  const lock = JSON.parse(await readFile(join(root, "package-lock.json"), "utf8"));
  // Local/workspace links may point outside node_modules and cannot be relocated safely.
  if (Object.values(lock.packages ?? {}).some((entry) => entry.link)) {
    install(root);
    return "bypass";
  }
  const key = await dependencyKey(root, config);
  const entry = join(cache, key);
  await mkdir(join(root, ".cache"), { recursive: true });
  try {
    await mkdir(cache, { recursive: true });
    if (await restore(root, entry, key)) {
      console.log(`Dependency cache hit: ${key.slice(0, 12)}`);
      return "hit";
    }
  } catch (error) {
    console.warn(`Dependency cache restore failed; running npm ci: ${error.message}`);
  }
  console.log(`Dependency cache miss: ${key.slice(0, 12)}`);
  // Discard an incomplete/failed entry before installing; a concurrent successful
  // publisher can then win without having its completed snapshot removed.
  await rm(entry, { recursive: true, force: true }).catch(() => {});
  install(root);
  // Only a successful clean install can publish a snapshot.
  try {
    await publish(root, cache, entry, key);
  } catch (error) {
    console.warn(`Dependency installation succeeded but cache was not saved: ${error.message}`);
  }
  return "miss";
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const root = resolve(import.meta.dirname, "..");
  await setupDependencies(root, resolve(process.argv[2]));
}
