# Developing FreAC

Build options and verification commands for contributors. For an introduction and
everyday use, see [FreAC — Free Agentic CAD](../README.md).

## Setup and run

Install Node.js 24 (24.15.0 or later within 24.x), which includes npm. With nvm,
run `nvm install` and `nvm use` in this repository; `.nvmrc` pins the tested version.
The sketch solver also needs a C++20 compiler and CMake. On macOS, install Xcode
Command Line Tools and Homebrew's `cmake` package. Linux needs compiler/CMake
packages. Windows needs a C++20-capable Visual Studio toolchain and CMake.
Setup downloads checksum-pinned Eigen 5.0.1 and Boost 1.90.0 archives into
`.cache/release-inputs` and uses their headers explicitly. No Qt or FreeCAD build
is needed. Linux/Windows build execution remains unverified.

Run all commands in this guide from the repository root, after activating `.nvmrc`:

```sh
npm ci
npm run setup:native
npm run setup:kernel
npm run dev
```

`dev` starts Vite and one Electron window, with renderer hot reload. Closing the
window or pressing Ctrl+C stops the owned development server. Changes to the
Electron entry or backend require restarting `dev`. `setup:native` downloads hash-verified PlaneGCS sources at the recorded FreeCAD
commit and builds a separate calculator. It needs network access on first use;
its source and build caches live in `.cache/solver` and `.build/solver`. Normal
`dev`/`build` runs rebuild the calculator incrementally without downloading sources.
`setup:kernel` downloads checksum-verified OCCT 7.9.3 source and builds the modeling
libraries plus FreAC's separate solid calculator. This initial source build takes
longer; its cache is `.cache/kernel` and the calculator is `.build/kernel`.
Alternatively, set `OCCT_ROOT` to an installed OCCT 7.9.3 SDK before running the
command. The SDK must match the calculator architecture. If CMake selects Intel
output on Apple Silicon, set `CMAKE_OSX_ARCHITECTURES=arm64` explicitly for
both `setup:native` and `setup:kernel`.
The installed-SDK and clean source-build routes are verified on macOS arm64.
Codex worktree setup links the main checkout's native caches and keeps `.build`
local. Its macOS defaults use Node's architecture and deployment target `14.0`,
matching the arm64 release SDK. Explicit environment overrides are preserved.
Using Node's architecture avoids selecting Intel output under a translated shell.
SDK reuse requires matching build settings as well as the pinned sources and
toolchain; sharing the cache directory alone does not guarantee a cache hit.
The fresh-checkout build used Node 24.15.0, Apple Clang 17, Eigen 5.0.1 and
Boost 1.90, without copying `node_modules/`, `.build/` or `.cache/` from another
checkout. This was a configured development Mac, not a fresh operating-system
installation. Linux/Windows builds remain unverified.

There is no pnpm or agent runtime dependency. The first Electron launch may download
its pinned runtime; installation, native source setup and that first launch require
network access.

`npm start` builds and launches the standalone app. `npm run dev:web` starts the shared frontend and a local development backend using the same
native calculator and document owner. It binds localhost and supports one editing
client; it is not a deployed remote-hosting implementation.

## Checks and clean builds

```sh
npm run build
npm run typecheck
npm run check
npm test
npx playwright install chromium webkit
npm run test:ui
npm run test:electron
```

Checks target the current `src/` application and honor Git ignores; they do not
format cached upstream sources.

To repeat setup from committed source, create a separate checkout with
`git worktree add --detach ../freac-clean HEAD`, enter it, activate `.nvmrc`,
and run the setup and check commands above. Start without copying `node_modules/`,
`.build/` or `.cache/` from another checkout. The compiler and CMake remain system
prerequisites; native sources and headers are downloaded and verified.

### Sketch and solid tools

The orientable tool controls have a focused real-input suite. After `npm run build`,
run `node tests/orientable-tools-ui.mjs` for Chromium; set `FREAC_TEST_BROWSER=webkit`
or `FREAC_TEST_BROWSER=electron` for WebKit or hidden Electron. It covers operation
glyphs, camera projection, actual editing, cancellation, history and reopening.
`FREAC_TOOL_ROUTE` optionally selects comma-separated route names from the runner.

Mirror has a focused real-input suite for sketch and body reference picking,
copy/replace, offset, cancellation, Undo/Redo, Save/Open and subsequent edits.
After `npm run build`, run `node tests/mirror-ui.mjs` for headless Chromium/WebKit
and hidden Electron. `FREAC_TEST_BROWSER=chromium`, `webkit` or `electron` limits
the run to that runtime.

The limited interactive face Move tool has a focused real-input suite:

```sh
npm run test:face-move
FREAC_TEST_BROWSER=webkit npm run test:face-move
npm run build
FREAC_TEST_BROWSER=electron npm run test:face-move
FREAC_FACE_FEATURES_ONLY=1 npm run test:face-move
FREAC_FACE_GENERAL_ONLY=1 npm run test:face-move
FREAC_FACE_SHARED_ONLY=1 npm run test:face-move
```

Electron runs hidden. The suite covers hole/pocket/boss selection and movement,
invalid recovery, temporary previews, Undo/Redo, Save/Open and adjacent tools.
See [the modeling contract](architecture/modeling-tools.md) for supported selections and limits.

The experimental edge Move prototype has its own ordinary-input route:

```sh
npm run test:edge-move
FREAC_TEST_BROWSER=webkit npm run test:edge-move
npm run build
FREAC_TEST_BROWSER=electron npm run test:edge-move
```

It exercises round and rectangular chamfer shoulders, the local boundary-normal
handle on rotated geometry, rejection recovery, history, Save/Open, reselection
and the adjacent face-Move route; see [the movement contract](architecture/modeling-tools.md#boundary-reconnection-2026-09-17).

Edge and face Move always use shared boundary reconnection. It rebuilds neighboring
faces from moved boundaries, allowing
curved results, and uses the same path for hole/pocket/boss movement on planar stock.

```sh
npm run test:reconnection
FREAC_TEST_BROWSER=webkit npm run test:reconnection
npm run build
FREAC_TEST_BROWSER=electron npm run test:reconnection
```

The suite covers upper-rim/top-face movement, sideways reconnection, a single
chamfer edge, moving a reopened warped face, planar feature regressions and archives.
Use [the modeling contract](architecture/modeling-tools.md) to inspect the deformation
choices. This does not establish general arbitrary-BRep support.

The `FREAC_FACE_FEATURES_ONLY` UI route builds/selects/moves these six cases using
ordinary controls; it accepts the same browser selection as the full suite.
`FREAC_FACE_GENERAL_ONLY` opens the captured rounded-wall pocket and builds an
L-shaped boss plus L-shaped/rectangular through-holes through ordinary controls.
It also accepts `FREAC_TEST_BROWSER=webkit` or `electron` (hidden).
`FREAC_FACE_SHARED_ONLY` exercises the captured multi-wall hole whose distinct
faces share a cylinder. These routes now exercise the shared reconnection path.

### Slow calculations and performance

Slow calculations keep the camera usable and show an operation/elapsed-time indicator
with Cancel (or Escape). Conflicting edits stay disabled. Timeout, cancellation and
geometric rejection retain the accepted document and have distinct diagnostics.
Explicit acceptance completes normally. To verify the captured slow-deletion route:

```sh
npm run build
node tests/calculation-ui.mjs
```

This runs headless Chromium/WebKit and hidden Electron, including navigation,
cancellation, timeout, recovery and adjacent sketch interaction checks. To measure
captured deletion and open/closed Shell with 1/2/4 kernel threads, without other test
workloads running:

```sh
npm test
node tests/kernel-calculation-performance.mjs
FREAC_KERNEL_TIMING=1 node tests/kernel-calculation-performance.mjs
```

The benchmark accepts an optional kernel executable path for comparisons. Timings
include input/output; native phase timings go to stderr. General Booleans, meshing,
face deletion and Shell validation Booleans enable supported OCCT parallel paths,
using all detected logical CPUs by default. `FREAC_KERNEL_THREADS` can limit the
pool explicitly. A thread count does not guarantee that every algorithm or single
feature can use all cores.

The backend owns the current in-memory document and Undo. Reloading the renderer
preserves both; **New document** clears them. Failed and no-op attempts remain in
the same history, with inputs and errors, but Undo/Redo skip them. Open starts fresh
Undo history. Exact bodies and topology IDs are saved; display meshes are regenerated
on Open. Desktop uses native file dialogs and unsaved-work prompts; paired iPad
browses computer files, while the standalone web frontend uses upload/download.
There is no geometry autosave.
UI checks own headless Chromium/WebKit instances and close them after the run.
To check just one engine, use `FREAC_TEST_BROWSER=chromium npm run test:ui`
or `FREAC_TEST_BROWSER=webkit npm run test:ui`. Each run owns its server/backend.
Electron checks hide their window; on macOS they still require a desktop session.
Linux browser prerequisites can be installed with Playwright's `install --with-deps`
option in the test machine/VM. Linux/Windows builds and physical iPad interaction
remain unverified until exercised on those targets.

[Agent instructions](../AGENTS.md) point to the current process and design.
The [FreeCAD compendium](freecad/README.md) is a targeted reference library;
its earlier architectural inferences are not current implementation requirements.

## Native document checks

The desktop File menu supports New/Open/Save/Save As/Close and standard shortcuts.
Restarting reopens the last saved file. Unsaved edits prompt before replacement or
close; this is not autosave or crash recovery. New clears the remembered file.

After activating the repository Node version with `source ~/.nvm/nvm.sh && nvm use`:

```sh
npm run build
node tests/document-lifecycle.mjs
node tests/document-web.mjs
```

The lifecycle route uses hidden Electron and an isolated profile, real drawing,
and programmed native-dialog responses. The web route checks Chromium/WebKit
upload/download and Undo. Shared geometry test launchers also isolate their
Electron profiles and explicitly discard between cases.

## Agent terminal checks

After activating `.nvmrc`, `npm ci` installs the pinned Ghostty-web and node-pty
dependencies and prepares node-pty's macOS helper. After `npm run build`, run
`node tests/agent-terminal.mjs` for hidden Electron and `node tests/agent-web.mjs`
for isolated Chromium/WebKit with a real test PTY. Run `node tests/agent-persistence.mjs`
for Save/Open/Save As, recovery and browser archive preservation. Set
`FREAC_CODEX_EXECUTABLE` and run `node tests/codex-portability.mjs` for a local
Codex transcript replay check without submitting a prompt. With that variable set,
`node tests/agent-orientation.mjs` checks hidden Electron commands/lifecycle plus
actual Codex prompt-input discovery and sandbox execution. These tests do not sign in
or use your browser. Linux/Windows builds and physical iPad input remain unverified.
`node tests/codex-permissions.mjs` with the same executable variable checks workspace
writes, automatic review and the parent-directory boundary using an isolated config.
`node tests/agent-inspection.mjs` exercises CLI inspection in hidden Electron;
`FREAC_TEST_BROWSER=chromium` or `webkit` exercises the shared inspection route.
`node tests/agent-quit-save.mjs` checks clean quit and final shutdown-write preservation.
`node tests/agent-script.mjs` covers typed creation, selection edits, atomic Undo/Redo,
failure/cancellation and manual re-editing in hidden Electron; set
`FREAC_TEST_BROWSER=chromium` or `webkit` for the isolated shared-browser route.
Electron also checks CPU-bound cancellation and script/model Save/Open; the
orientation test exercises a real script through the installed Codex sandbox.
`node tests/agent-revolve.mjs` covers manual Revolve plus a typed CLI helical cut,
Undo/Redo, failed-script rollback, manual body movement and Save/Open; the same
`FREAC_TEST_BROWSER` settings exercise Chromium/WebKit.
That test also records a native top-face offset failure after the helical cut;
the rejected offset preserves the model and is not counted as successful editing.
TypeScript is a pinned runtime dependency so script checking needs no personal compiler.

## iPad checks

After `npm run build`, run `node tests/ipad-ui.mjs` for the real host with hidden
Electron and isolated Chromium/WebKit. Physical iPad/Pencil behavior remains unverified.

## Shell and topology deletion checks

After `npm run build`:

```sh
node tests/shell-ui.mjs
node tests/selection-operations-ui.mjs
node tests/delete-topology-ui.mjs
FREAC_TEST_BROWSER=webkit node tests/delete-topology-ui.mjs
FREAC_TEST_BROWSER=electron node tests/delete-topology-ui.mjs
```
