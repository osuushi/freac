import { rm } from "node:fs/promises";

await rm(new URL("../.cache/sketch-tests/", import.meta.url), { recursive: true, force: true });
