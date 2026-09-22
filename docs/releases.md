# macOS releases

Freac's original code is LGPL-2.1-or-later; dependency licenses remain unchanged.
The first distribution target is Apple Silicon on macOS 14 or newer, outside the
App Store. Release builds are manually requested from `main`; they do not run
on pushes or pull requests. Intel, Windows installers and automatic updates are
outside this release pipeline.

## Local package and verification

From the repository root, activate `.nvmrc` (`source ~/.nvm/nvm.sh && nvm use` on
the development Mac). Install CMake and Xcode Command Line Tools, then:

```sh
npm ci
export CMAKE_OSX_ARCHITECTURES=arm64
export MACOSX_DEPLOYMENT_TARGET=14.0
npm run setup:native
npm run setup:kernel
npm run package:mac
node scripts/release/verify.mjs
node tests/release-package.mjs
```

The app is `.build/packages/Freac-darwin-arm64/Freac.app`. `npm run make:mac`
also makes a DMG under `.build/packages/make/`. Without `FREAC_SIGN=1` these are
local development artifacts, not notarized downloads. The packaged app includes
its native calculators, OCCT libraries, runtime dependencies and offline licenses;
it does not require Node, Homebrew, a checkout or a coding agent to draw geometry.
An external coding agent remains an optional separate installation.

The hidden package test uses a temporary user profile, unrelated working directory
and restricted PATH. It exercises sketch/solid geometry, Undo, save/reopen, the PTY
and shipped CLI, and offline notices. It does not establish clean-device
Gatekeeper behavior. Verify the signed DMG downloaded through a browser on a
separate Mac before sending it to recipients.

## GitHub signing setup

Create a GitHub environment named `macos-release` with these secrets:

| Secret | Value |
| --- | --- |
| `APPLE_CERTIFICATE_P12_BASE64` | Base64 export of Developer ID Application certificate **and private key** |
| `APPLE_CERTIFICATE_PASSWORD` | Export password |
| `APPLE_SIGNING_IDENTITY` | Exact `Developer ID Application: … (TEAMID)` identity |
| `APPLE_ID` | Developer account email |
| `APPLE_TEAM_ID` | Apple developer Team ID |
| `APPLE_APP_SPECIFIC_PASSWORD` | Apple app-specific password for notarization |

Use Developer ID Application, not an Apple Development or Mac App Store
certificate. An individual paid Developer Program membership is sufficient.
Do not put credentials in the checkout, chat, logs or caches. The workflow imports
its certificate into a temporary keychain and removes it even if signing fails.

Run **Actions → Release macOS arm64 → Run workflow**, selecting `main`. It checks
secrets before the expensive build, selects arm64 `macos-15` and Xcode 16.4, builds
and tests the unsigned app, signs and notarizes the app and DMG, tests the signed
app, and only then publishes a prerelease. Failed source preparation prevents
publishing the app release. Do not enable automatic cancellation while signing.
GitHub's runner image can remove an Xcode installation; update the explicit
selection and revalidate the deployment target if that happens.

Every release name displays UTC ISO 8601 (`2026-09-22T14:35:12Z`). Tags and filenames
use its basic form (`20260922T143512Z`). npm and Apple metadata receive numeric
versions, while `build.json`, Info.plist and About retain the full timestamp and
commit. The timestamp is generated once per run. Reruns get a new release identity.
The stable bundle ID is `com.osuushi.freac`.

## Source and license distribution

Help → Third-party licenses and About → Third-party licenses work offline.
The inventory includes installed production npm packages (including embedded
renderer dependencies), preserved Electron/Chromium notices, native dependencies,
Vite's renderer helper and the terminal WASM's additional notices. An unsupported
new npm license must be reviewed before release; package metadata alone is not
an audit of embedded code.

`node scripts/release/sources.mjs` requires a clean tree at the packaged commit.
It creates `Freac-<timestamp>-sources.tar.gz` containing the complete Freac tree,
OCCT's original archive, original/adapted PlaneGCS files, pinned Eigen and Boost
archives, licenses and build instructions. `SHA256SUMS` covers each release asset.
The scripts verify the native source checksums even on cache hits.

Electron 44.3.0 includes Chromium 152.0.7977.78. Preserve their matching source
archives and Electron patches as well as their notices. The complete Chromium
archive is about 6 GB and exceeds GitHub's per-asset limit. A Linux job downloads
and verifies the official archive, splits it into six parts, and creates a
source-only prerelease `runtime-sources-electron-44.3.0`. Later app releases reuse
that source release, avoiding a repeated 6 GB download and preserving macOS cache
space. `packaging/runtime-sources.json` pins checksums and exact versions;
`packaging/RUNTIME-SOURCES.md` describes reconstruction and runtime rebuilds.
Update these pins and audit the runtime notices whenever Electron changes.

Everyone receiving the app must also be able to get its Freac/native source
archive and the matching runtime source release. A private GitHub release needs
repository access: if sharing a DMG through a private folder, make the source
materials available to those recipients there too. Do not delete source releases
that accompany binaries still being distributed. No Apple private keys are part
of the source materials or necessary for local modifications.

To rebuild Freac/native components, extract its sources archive, activate Node 24,
install CMake/compiler, and run the local build commands above. The archive's
`.cache` contains verified native inputs, so native source setup needs no upstream
download. npm dependencies and Electron still come from their locked downloads.
Use `FREAC_ELECTRON_ZIP_DIR` to supply a locally rebuilt Electron zip distribution.

For a local OCCT replacement, build the modified 7.9.3-compatible shared libraries
with the same arm64/deployment target and configure Freac with `OCCT_ROOT` pointing
to that SDK; package again without `FREAC_SIGN`. For PlaneGCS, change the source
under `.cache/solver/source` after setup and use `npm run build` (rerunning
`setup:native` restores the pinned adaptations). The entire solver wrapper is
LGPL, so no proprietary relinking objects are needed. To use a modified installed
copy, replace the matching files under `Freac.app/Contents/Resources/native`,
preserve their install names and re-sign the modified app locally:

```sh
find /path/to/Modified-Freac.app/Contents/Resources/native -type f \
  -exec codesign --force --sign - --options=0 {} \;
codesign --force --deep --sign - --options=0 /path/to/Modified-Freac.app
```

This ad-hoc command is for personal modified copies. It clears the hardened-runtime
flags that otherwise require matching Developer ID teams for loaded libraries.
The explicit native pass is necessary because `--deep` does not discover every
helper executable stored under Resources.
The production pipeline
signs nested code through Electron's signing tools. Original Developer ID
signatures/notarization cannot attest to modified bytes; macOS may require local
approval for a downloaded or modified app. Do not disable system-wide Gatekeeper.

## Caches

The workflow caches npm downloads, Electron downloads, verified native sources,
the installed OCCT SDK and a bounded 1 GB C++ compiler cache. SDK keys include
source/build scripts, target architecture, minimum OS, compiler, SDK and CMake
versions. Native wrapper edits reuse the SDK; toolchain or OCCT changes invalidate
it. `ccache` handles changed compiler inputs; CMake configures freshly on each
runner. No keys, keychains, signed packages or notarization tickets are cached.
Caches are accelerators; cold builds remain supported. The runtime source release
is durable distribution material, not an Actions cache.

CI downloads Eigen from the repository's `native-sources-eigen-5.0.1` source-only
release because GitLab rejected the hosted runner's download with HTTP 406.
This is the unchanged upstream archive; native setup verifies its pinned SHA-256
before extraction. Keep this source release available for cold builds.

Measure cold, warm, and small-native-change runs from Actions timing and
`ccache --show-stats`. Local build checks do not establish CI cache-hit timings.
