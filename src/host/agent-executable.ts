import { constants } from "node:fs";
import { access, stat } from "node:fs/promises";
import { delimiter, join, resolve } from "node:path";

/** Resolve without invoking a shell, including Finder launches with a limited PATH. */
export async function agentExecutable(
  executable: string,
  cwd: string,
  env: NodeJS.ProcessEnv,
): Promise<string> {
  const directories = /[/\\]/.test(executable) ? [""] : (env.PATH ?? "").split(delimiter);
  const suffixes =
    process.platform === "win32" ? ["", ...(env.PATHEXT ?? ".EXE;.CMD;.BAT").split(";")] : [""];
  for (const directory of directories) {
    for (const suffix of suffixes) {
      const path = resolve(
        cwd,
        directory ? join(directory, executable + suffix) : executable + suffix,
      );
      try {
        if (!(await stat(path)).isFile()) continue;
        await access(path, process.platform === "win32" ? constants.F_OK : constants.X_OK);
        return path;
      } catch (error) {
        if (!["ENOENT", "ENOTDIR", "EACCES"].includes((error as NodeJS.ErrnoException).code ?? ""))
          throw error;
      }
    }
  }
  throw new Error("Executable was not found or is not executable.");
}
