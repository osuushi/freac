# Electron 44.3.0 corresponding sources

This source-only prerelease accompanies Freac builds using Electron 44.3.0.
Keep it accessible to everyone receiving those builds. These assets are reused
across Freac releases and must not be deleted while distributing those versions.
They are optional downloads for using the app, required materials for rebuilding
or modifying the bundled runtime. No Apple account or signing key is needed for
a local rebuild.

The complete Chromium 152.0.7977.78 source archive includes its bundled source
dependencies (including FFmpeg and Blink/WebKit). Electron's archive includes its
patches, DEPS pins, build configuration and build instructions. Preserve the
third-party licenses in those trees. The archives are unmodified upstream inputs;
Freac does not patch its Electron runtime. See runtime-sources.json for exact
checksums and Electron's commit.

Download all six Chromium parts and concatenate in filename order:

```sh
cat chromium-152.0.7977.78.tar.xz.part-* > chromium-152.0.7977.78.tar.xz
shasum -a 256 chromium-152.0.7977.78.tar.xz
```

Expected SHA-256:
`16bb4164faa455d1e6a43320b3c0e4c895a93138e892a1bbf7e801863dc4bc74`.
The SHA256SUMS file also identifies every individual download.

For an Electron rebuild, follow docs/development/build-instructions-gn.md in
Electron's archive at commit 07e460719c75b2ec5ee4893f7d2192ef31c7b8c2. Its DEPS and
patches select Chromium and other dependencies; fetch any remaining permissive
build dependencies with the documented gclient workflow. Use an arm64 Release
build on macOS. Electron's production build configuration is in build/args/release.gn.
Use the rebuilt Electron distribution with Electron Packager's electronZipDir
option (available through forge.config.js), then package Freac with signing off.
See docs/releases.md in Freac's matching source archive for local signing and
replacement instructions. Apple's original notarization does not apply to your
modified copy; it is not necessary for a local rebuild.
