import { resolve } from "node:path";
import { meshInputCache, prepareMeshInputs } from "./mesh-inputs.mjs";
import { nativeFlags, run } from "./native-inputs.mjs";

await prepareMeshInputs();
const root = resolve(import.meta.dirname, "..");
const build = resolve(root, ".build/mesh");
run("cmake", [
  "-S",
  resolve(root, "native/mesh"),
  "-B",
  build,
  `-DMANIFOLD_SOURCE=${resolve(meshInputCache, "manifold")}`,
  `-DFETCHCONTENT_SOURCE_DIR_TBB=${resolve(meshInputCache, "tbb")}`,
  "-DCMAKE_BUILD_TYPE=Release",
  ...nativeFlags(),
]);
run("cmake", ["--build", build, "--config", "Release", "--parallel", "4"]);
