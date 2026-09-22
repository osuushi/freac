import type { SketchEditor } from "../sketch/editor.js";

export const categories = [
  ["Sketch", "Line, rectangle, curve and trim"],
  ["Solid", "Extrude, shell, fillet and combine"],
  ["Transform", "Move, duplicate, mirror and scale"],
  ["Constrain", "Relationships, point links and locks"],
  ["Reference", "Construction planes and projection"],
  ["Select", "Select and refine geometry"],
  ["View", "Visibility, grid and workspace"],
  ["Document & Edit", "Files, export, history and deletion"],
  ["Development", "Capture diagnostic fixtures"],
] as const;
export type Category = (typeof categories)[number][0];
export interface ToolDefinition {
  id: string;
  label: string;
  category: Category;
  description?: string;
  aliases?: readonly string[];
  related?: readonly string[];
  shortcut?: string;
  reason: () => string | null;
  run: () => unknown;
  allowBusy?: boolean;
}
export interface ToolResult extends ToolDefinition {
  unavailable: string | null;
}
const catalogs = new WeakMap<SketchEditor, ToolCatalog>();
export function toolCatalog(editor: SketchEditor): ToolCatalog {
  let catalog = catalogs.get(editor);
  if (!catalog) {
    catalog = new ToolCatalog(editor);
    catalogs.set(editor, catalog);
  }
  return catalog;
}
export function idleReason(editor: SketchEditor): string | null {
  return editor.interactions.current ? "Finish or cancel the current edit first" : null;
}
export class ToolCatalog {
  private entries = new Map<string, ToolDefinition>();
  private running = false;
  constructor(private editor: SketchEditor) {}
  register(tool: ToolDefinition): () => void {
    if (this.entries.has(tool.id)) throw new Error(`Duplicate tool: ${tool.id}`);
    this.entries.set(tool.id, tool);
    return () => this.entries.delete(tool.id);
  }
  reason(tool: ToolDefinition): string | null {
    if (this.running) return "Switching tools…";
    if (this.editor.isDragging) return "Finish the current drag first";
    if (this.editor.blocked && !tool.allowBusy) return "Wait for the current calculation";
    return tool.reason();
  }
  results(): ToolResult[] {
    return [...this.entries.values()].map((tool) => ({ ...tool, unavailable: this.reason(tool) }));
  }
  async invoke(id: string): Promise<void> {
    const tool = this.entries.get(id);
    if (!tool) return;
    const reason = this.reason(tool);
    if (reason) {
      this.editor.message = reason;
      this.editor.refresh();
      return;
    }
    this.running = true;
    try {
      await tool.run();
    } catch (error) {
      this.editor.message = error instanceof Error ? error.message : String(error);
    } finally {
      this.running = false;
      this.editor.refresh();
    }
  }
}
