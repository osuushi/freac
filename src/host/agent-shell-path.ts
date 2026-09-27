import { execFile } from "node:child_process";
import { homedir, userInfo } from "node:os";
import { promisify } from "node:util";

const execute = promisify(execFile);

/** Finder does not inherit the PATH configured by terminal shell startup files. */
export async function agentShellPath(env: NodeJS.ProcessEnv): Promise<string | undefined> {
  if (process.platform !== "darwin") return env.PATH;
  try {
    const shell = env.SHELL || userInfo().shell || "/bin/zsh";
    const { stdout } = await execute(shell, ["-ilc", "printf '\\0FREAC_PATH\\0%s\\0' \"$PATH\""], {
      cwd: homedir(),
      env,
      timeout: 5000,
      killSignal: "SIGKILL",
      maxBuffer: 1024 * 1024,
      encoding: "utf8",
    });
    // Startup files can print banners; accept only our delimited PATH value.
    return /\0FREAC_PATH\0([^\0]+)\0/.exec(stdout)?.[1] ?? env.PATH;
  } catch {
    // Broken or interactive startup must not prevent an explicit executable launch.
    return env.PATH;
  }
}
