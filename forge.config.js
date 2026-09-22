import { existsSync } from "node:fs";
import { chmod, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";

const release = resolve(".build/release");
const metadata = JSON.parse(await readFile(join(release, "build.json"), "utf8"));
const signed = process.env.FREAC_SIGN === "1";
if (signed && !process.env.APPLE_SIGNING_IDENTITY)
  throw new Error("APPLE_SIGNING_IDENTITY is required for signed releases");
export default {
  outDir: ".build/packages",
  packagerConfig: {
    name: "Freac",
    executableName: "Freac",
    icon: resolve("packaging/icons/freac"),
    appBundleId: "com.osuushi.freac",
    appCategoryType: "public.app-category.graphics-design",
    appVersion: metadata.shortVersion,
    buildVersion: metadata.bundleVersion,
    extendInfo: {
      FreacReleaseTimestamp: metadata.timestamp,
      FreacCommit: metadata.commit,
      LSMinimumSystemVersion: "14.0",
    },
    ...(process.env.FREAC_ELECTRON_ZIP_DIR
      ? { electronZipDir: process.env.FREAC_ELECTRON_ZIP_DIR }
      : {}),
    darwinDarkModeSupport: true,
    // Loose resources also support the shipped Electron-as-Node agent CLI.
    asar: false,
    prune: true,
    overwrite: true,
    extraResource: [
      join(release, "native"),
      join(release, "licenses"),
      join(release, "build.json"),
    ],
    ignore: (path) =>
      path !== "" &&
      !/^\/(package\.json|node_modules(?:\/|$)|\.build(?:$|\/(host|renderer)(?:\/|$)))/.test(path),
    ...(signed
      ? {
          osxSign: {
            identity: process.env.APPLE_SIGNING_IDENTITY,
            keychain: process.env.APPLE_SIGNING_KEYCHAIN,
            preAutoEntitlements: false,
            hardenedRuntime: true,
            optionsForFile: (path) => ({
              entitlements: resolve(
                path.includes("/native/")
                  ? "packaging/native.entitlements.plist"
                  : "packaging/electron.entitlements.plist",
              ),
            }),
          },
          osxNotarize: {
            appleId: process.env.APPLE_ID,
            appleIdPassword: process.env.APPLE_APP_SPECIFIC_PASSWORD,
            teamId: process.env.APPLE_TEAM_ID,
          },
        }
      : {}),
  },
  // node-pty uses N-API prebuilds; remove build-only and foreign-platform binaries.
  hooks: {
    packageAfterPrune: async (_config, buildPath) => {
      // npm pruning leaves development-tool links here; the app uses direct paths.
      await rm(join(buildPath, "node_modules/.bin"), { recursive: true, force: true });
      const packageFile = join(buildPath, "package.json");
      const pkg = JSON.parse(await readFile(packageFile, "utf8"));
      pkg.version = metadata.version;
      await writeFile(packageFile, JSON.stringify(pkg, null, 2));
      const pty = join(buildPath, "node_modules/node-pty");
      for (const name of ["build", "deps", "third_party", "src", "scripts"])
        await rm(join(pty, name), { recursive: true, force: true });
      for (const arch of await readdir(join(pty, "prebuilds")))
        if (arch !== "darwin-arm64") await rm(join(pty, "prebuilds", arch), { recursive: true });
      const helper = join(pty, "prebuilds/darwin-arm64/spawn-helper");
      if (!existsSync(helper)) throw new Error("Missing node-pty arm64 helper");
      await chmod(helper, 0o755);
    },
  },
  rebuildConfig: { onlyModules: [] },
  makers: [
    {
      name: "@electron-forge/maker-dmg",
      config: {
        name: `Freac-${metadata.tag}-arm64`,
        title: "Freac",
        format: "ULFO",
        overwrite: true,
      },
    },
  ],
};
