import { threadDefinition } from "./thread-settings.js";

/** Built-in cylindrical decorators share attachment, history and topology rules. */
export const knurlDefinition = "freac.knurling";
export function isBuiltinDecorator(definition: string): boolean {
  return definition === threadDefinition || definition === knurlDefinition;
}
