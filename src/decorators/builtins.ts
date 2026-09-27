import { threadDefinition } from "./thread-settings.js";

/** Cylindrical built-ins use the original attachment protocol; gears use the manifest hooks. */
export const knurlDefinition = "freac.knurling";
export function isBuiltinDecorator(definition: string): boolean {
  return definition === threadDefinition || definition === knurlDefinition;
}
