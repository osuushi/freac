#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
makeshift_setup_started=$SECONDS
timed() {
  local label="$1" started=$SECONDS status=0
  shift
  "$@" || status=$?
  echo "Setup $label: $((SECONDS - started))s (exit $status)"
  return "$status"
}
# Match the native macOS SDK settings used by the main workspace/release build.
export CMAKE_OSX_ARCHITECTURES="${CMAKE_OSX_ARCHITECTURES:-$(node -p 'process.arch === "arm64" ? "arm64" : "x86_64"')}"
export MACOSX_DEPLOYMENT_TARGET="${MACOSX_DEPLOYMENT_TARGET:-14.0}"
makeshift_main_workspace="$(dirname "$(git rev-parse --path-format=absolute --git-common-dir)")"
timed "dependencies" node scripts/worktree-dependencies.mjs "$makeshift_main_workspace/.cache/dependencies"
# Shared compiler outputs; CMake build directories remain checkout-local.
if command -v ccache >/dev/null 2>&1; then
  export CCACHE_DIR="${CCACHE_DIR:-$makeshift_main_workspace/.cache/ccache}"
  export CCACHE_BASEDIR="${CCACHE_BASEDIR:-$(pwd -P)}"
  export CCACHE_MAXSIZE="${CCACHE_MAXSIZE:-2G}"
  # Persist settings in CMake so later dev/build commands use the same cache.
  export CMAKE_CXX_COMPILER_LAUNCHER="${CMAKE_CXX_COMPILER_LAUNCHER:-$(command -v ccache);cache_dir=$CCACHE_DIR;base_dir=$CCACHE_BASEDIR;max_size=$CCACHE_MAXSIZE}"
  echo "Compiler cache: $CCACHE_DIR"
else
  echo "ccache unavailable; native builds uncached (brew install ccache)."
fi
export MAKESHIFT_MESH_ARCHIVE_CACHE="${MAKESHIFT_MESH_ARCHIVE_CACHE:-${FREAC_MESH_ARCHIVE_CACHE:-$makeshift_main_workspace/.cache/mesh-archives}}"
if [ "$makeshift_main_workspace" != "$(pwd -P)" ]; then
  mkdir -p .cache
  for makeshift_cache in solver release-inputs; do
    if [ ! -e ".cache/$makeshift_cache" ] && [ ! -L ".cache/$makeshift_cache" ] && [ -d "$makeshift_main_workspace/.cache/$makeshift_cache" ]; then
      ln -s "$makeshift_main_workspace/.cache/$makeshift_cache" ".cache/$makeshift_cache"
    fi
  done
  # Consume the installed SDK, never another checkout's mutable CMake build tree.
  makeshift_sdk="$makeshift_main_workspace/.cache/kernel/sdk"
  if [ -z "${OCCT_ROOT:-}" ] && [ -f "$makeshift_sdk/.freac-sdk.json" ] && node scripts/sdk-provenance.mjs "$makeshift_sdk"; then
    if lipo "$makeshift_sdk/lib/libTKernel.dylib" -verify_arch $CMAKE_OSX_ARCHITECTURES; then
      export OCCT_ROOT="$makeshift_sdk"
      echo "Using main workspace OCCT SDK: $OCCT_ROOT"
    fi
  fi
  # Migrate links made by the old setup; unlinking preserves the main cache.
  if [ -L .cache/kernel ]; then
    unlink .cache/kernel
  fi
fi
timed "solver" npm run setup:native
timed "kernel" npm run setup:kernel
timed "mesh" npm run setup:mesh
if command -v ccache >/dev/null 2>&1; then
  ccache --show-stats
fi
echo "Worktree setup total: $((SECONDS - makeshift_setup_started))s"
