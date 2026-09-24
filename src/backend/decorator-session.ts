import { editJavaScriptDecorators, needsJavaScript } from "../decorators/javascript-edits.js";
import { type EnabledDefinition, JavaScriptDecorators } from "../decorators/javascript-hooks.js";
import { initializeDecoratorRuntime } from "../decorators/javascript-runtime.js";
import type { SketchDocument } from "../sketch/document.js";
import type { ModelRequest } from "../sketch/model-api.js";

/** Local enablement is intentionally absent from archives and Undo snapshots. */
export class DecoratorSession {
  async edit(document: SketchDocument, request: ModelRequest): Promise<SketchDocument | null> {
    if (request.kind === "decorator-enable") {
      this.enable(document, request.id, request.version, request.enabled);
      return document;
    }
    if (request.kind === "decorator" && needsJavaScript(document, request.edit))
      return editJavaScriptDecorators(document, request.edit, await this.hooks());
    return null;
  }
  private enabled: EnabledDefinition[] = [];
  private runtime?: ReturnType<typeof initializeDecoratorRuntime>;
  get sources(): readonly EnabledDefinition[] {
    return this.enabled;
  }
  clear(): void {
    this.enabled = [];
  }
  enable(document: SketchDocument, id: string, version: number, enabled: boolean): void {
    if (typeof enabled !== "boolean") throw new Error("Invalid decorator enablement");
    const definition = document.decoratorDefinitions?.find(
      (d) => d.id === id && d.version === version,
    );
    if (!definition) throw new Error("Select an existing bundled decorator");
    this.enabled = this.enabled.filter((d) => d.id !== id || d.version !== version);
    if (enabled) this.enabled.push({ id, version, source: definition.source });
  }
  async hooks(): Promise<JavaScriptDecorators> {
    this.runtime ??= initializeDecoratorRuntime();
    return new JavaScriptDecorators(await this.runtime, this.enabled);
  }
}
