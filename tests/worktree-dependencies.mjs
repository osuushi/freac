import assert from "node:assert/strict";
import { chmod, mkdir, mkdtemp, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { dependencyKey, setupDependencies } from "../scripts/worktree-dependencies.mjs";

async function fixture(directory) {
  await mkdir(join(directory, "scripts"), { recursive: true });
  const manifest = {
    name: "freac-dependency-cache-test",
    version: "1.0.0",
    scripts: { postinstall: "node scripts/install.mjs" },
  };
  await writeFile(join(directory, "package.json"), JSON.stringify(manifest));
  await writeFile(
    join(directory, "package-lock.json"),
    JSON.stringify({
      name: manifest.name,
      version: "1.0.0",
      lockfileVersion: 3,
      packages: { "": manifest },
    }),
  );
  await writeFile(
    join(directory, "scripts/install.mjs"),
    `import {mkdirSync,writeFileSync,symlinkSync,chmodSync,existsSync} from 'node:fs';
if (existsSync('fail-install')) throw new Error('intentional install failure');
mkdirSync('node_modules/.bin', {recursive:true});
writeFileSync('node_modules/value', '#!/bin/sh\\necho ready\\n');
chmodSync('node_modules/value', 0o755);
symlinkSync('../value', 'node_modules/.bin/value');
`,
  );
}

test("dependency identity follows config, runtime environment, lock and lifecycle helpers", async () => {
  const root = await mkdtemp(join(tmpdir(), "freac-dependency-key-"));
  try {
    await fixture(root);
    const config = { "npm-version": "test", "ignore-scripts": false };
    const original = await dependencyKey(root, config, {});
    assert.notEqual(await dependencyKey(root, { ...config, "ignore-scripts": true }, {}), original);
    assert.notEqual(await dependencyKey(root, { ...config, "npm-version": "next" }, {}), original);
    assert.notEqual(await dependencyKey(root, config, { NODE_ENV: "production" }), original);
    await writeFile(join(root, ".npmrc"), "install-strategy=hoisted\n");
    assert.notEqual(await dependencyKey(root, config, {}), original);
    await rm(join(root, ".npmrc"));
    await writeFile(join(root, "scripts/install.mjs"), "// changed lifecycle helper\n");
    assert.notEqual(await dependencyKey(root, config, {}), original);
    await fixture(root);
    await writeFile(join(root, "package-lock.json"), "changed lockfile");
    assert.notEqual(await dependencyKey(root, config, {}), original);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("completed installations relocate independently; incomplete and failed entries cannot hit", {
  skip: process.platform !== "darwin",
}, async () => {
  const root = await mkdtemp(join(tmpdir(), "freac-dependency-cache-"));
  const first = join(root, "first"),
    second = join(root, "second"),
    cache = join(root, "cache");
  try {
    await fixture(first);
    await fixture(second);
    assert.equal(await setupDependencies(first, cache), "miss");
    assert.equal(await setupDependencies(second, cache), "hit");
    const entry = join(cache, (await readdir(cache))[0]);
    const value = join(second, "node_modules/value");
    assert.equal(
      await readFile(join(second, "node_modules/.bin/value"), "utf8"),
      "#!/bin/sh\necho ready\n",
    );
    assert.equal((await stat(value)).mode & 0o111, 0o111);
    await writeFile(value, "independent edit");
    await chmod(value, 0o600);
    assert.equal(
      await readFile(join(entry, "node_modules/value"), "utf8"),
      "#!/bin/sh\necho ready\n",
    );
    assert.equal((await stat(join(entry, "node_modules/value"))).mode & 0o111, 0o111);
    assert.equal(
      await readFile(join(first, "node_modules/value"), "utf8"),
      "#!/bin/sh\necho ready\n",
    );
    await rm(join(entry, "complete"));
    assert.equal(await setupDependencies(second, cache), "miss");
    await rm(join(entry, "node_modules"), { recursive: true });
    assert.equal(await setupDependencies(second, cache), "miss");
    await rm(entry, { recursive: true });
    await writeFile(join(second, "fail-install"), "");
    await assert.rejects(setupDependencies(second, cache));
    assert.deepEqual(await readdir(cache), []);
    await rm(join(second, "fail-install"));
    assert.equal(await setupDependencies(second, cache), "miss");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("explicit bypass runs npm without publishing a snapshot", async () => {
  const root = await mkdtemp(join(tmpdir(), "freac-dependency-bypass-"));
  const previous = process.env.FREAC_DEPENDENCY_CACHE;
  try {
    await fixture(root);
    process.env.FREAC_DEPENDENCY_CACHE = "0";
    assert.equal(await setupDependencies(root, join(root, "cache")), "bypass");
    await assert.rejects(stat(join(root, "cache")), { code: "ENOENT" });
    assert.equal(
      await readFile(join(root, "node_modules/value"), "utf8"),
      "#!/bin/sh\necho ready\n",
    );
  } finally {
    if (previous === undefined) delete process.env.FREAC_DEPENDENCY_CACHE;
    else process.env.FREAC_DEPENDENCY_CACHE = previous;
    await rm(root, { recursive: true, force: true });
  }
});
