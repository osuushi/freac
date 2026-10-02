import { existsSync } from "node:fs";
import { join } from "node:path";
import { app } from "electron";

/** Reuse the former application's preferences and private agent workspace in place. */
export function configureApplicationIdentity(): void {
  app.setName("Makeshift");
  if (app.commandLine.hasSwitch("user-data-dir")) return;
  const current = app.getPath("userData");
  if (existsSync(current)) return;
  for (const name of ["Freac", "freac"]) {
    const legacy = join(app.getPath("appData"), name);
    if (existsSync(legacy)) {
      app.setPath("userData", legacy);
      return;
    }
  }
}
