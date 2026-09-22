# Embedded terminal notices

The files here preserve upstream notices not fully exposed by npm metadata.

- ghostty-web 0.4.0 source commit
  [9e4e126d](https://github.com/coder/ghostty-web/tree/9e4e126d89ac3537d2b2ebec075849851566de9f)
  selects Ghostty submodule
  [5714ed07](https://github.com/ghostty-org/ghostty/tree/5714ed07a1012573261b7b7e3ed2add9c1504496).
  Its [build script](https://github.com/coder/ghostty-web/blob/9e4e126d89ac3537d2b2ebec075849851566de9f/scripts/build-wasm.sh)
  applies its WASM API patch and builds the freestanding lib-vt target with Zig 0.15.2.
- Ghostty's [GhosttyZig.initVt](https://github.com/ghostty-org/ghostty/blob/5714ed07a1012573261b7b7e3ed2add9c1504496/src/build/GhosttyZig.zig)
  imports Unicode tables; its [dependency pins](https://github.com/ghostty-org/ghostty/blob/5714ed07a1012573261b7b7e3ed2add9c1504496/build.zig.zon)
  select uucode [31655fba](https://github.com/jacobsandlund/uucode/tree/31655fba3c638229989cc524363ef5e3c7b580c1).
  We retain its own license, Unicode/decoder notices and width-data notices.
- [Zig 0.15.2 LICENSE](https://github.com/ziglang/zig/blob/0.15.2/LICENSE)
  covers the runtime support used by the upstream build.

These are source observations about the upstream build, not a claim that Freac
rebuilt or independently reproduced the published WASM. The npm tarball and its
integrity are pinned by package-lock.json. Review these notices when upgrading
Ghostty. Native OCCT/PlaneGCS/Eigen/Boost and npm notices are generated from the
actual verified inputs; Electron's supplied Chromium inventory is preserved whole.
