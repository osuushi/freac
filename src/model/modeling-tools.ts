import type { SketchEditor } from "../sketch/editor.js";
import { onModelKeydown } from "../sketch/model-keys.js";
import type { ModelingTool } from "../sketch/model-selection.js";
import { toolCatalog } from "../tools/catalog.js";
import { SelectionTools } from "./selection-tools.js";

const entries = [
  ["extrude", "Extrude", "E", ["extrusion"], ["twist", "draft", "push pull"]],
  ["offset", "Offset faces", "O", ["face offset"], ["thickness", "resize"]],
  ["shell", "Shell", "S", ["thickness", "hollow"], ["wall"]],
  ["move", "Move", "M", ["translate", "rotate"], []],
  ["fillet", "Fillet", "F", ["round", "rounding"], []],
  ["chamfer", "Chamfer", "⇧F", ["bevel"], []],
  ["revolve", "Revolve", "⇧R", ["revolution", "lathe"], ["screw", "helix"]],
] as const;
export class ModelingTools {
  private menu: SelectionTools;
  private abort = new AbortController();
  private disposers: (() => void)[] = [];
  constructor(
    private editor: SketchEditor,
    private revolve: () => void,
    private edgeMode: (mode: "fillet" | "chamfer") => void,
  ) {
    const catalog = toolCatalog(editor);
    for (const [tool, label, shortcut, aliases, related] of entries) {
      if (tool === "move") continue;
      this.disposers.push(
        catalog.register({
          id: tool,
          label,
          shortcut,
          aliases,
          related,
          category: "Solid",
          reason: () => this.reason(tool),
          run: () => this.choose(tool),
        }),
      );
    }
    this.menu = new SelectionTools(editor);
    onModelKeydown(
      (event) => {
        if (
          editor.world.active ||
          event.ctrlKey ||
          event.metaKey ||
          event.altKey ||
          (event.target instanceof HTMLElement &&
            (event.target.matches("input, select, textarea") || event.target.isContentEditable))
        )
          return;
        const key = event.key.toLowerCase();
        const tool =
          key === "r" && event.shiftKey
            ? "revolve"
            : key === "f"
              ? event.shiftKey
                ? "chamfer"
                : "fillet"
              : (
                  { e: "extrude", o: "offset", m: "move", s: "shell" } as Record<
                    string,
                    ModelingTool
                  >
                )[key];
        if (!tool) return;
        event.preventDefault();
        event.stopImmediatePropagation();
        void catalog.invoke(tool === "move" ? "transform" : tool);
      },
      { signal: this.abort.signal, capture: true },
    );
  }
  private reason(tool: ModelingTool): string | null {
    if (this.editor.world.active) return "Return to Modeling and select solid geometry";
    if (!this.editor.modeling.targets.length)
      return {
        shell: "Select a body or faces to shell",
        offset: "Select faces or bodies to offset",
        move: "Select bodies, faces or edges to move",
        fillet: "Select solid edges to round",
        chamfer: "Select solid edges to bevel",
        extrude: "Select a closed profile or planar face",
        revolve: "Select a closed profile or planar face",
      }[tool];
    const result = this.editor.modeling.resolve(tool);
    if (!result.available) return result.reason;
    const current = this.editor.interactions.current;
    if (current && !current.finish) return "Finish or cancel the current edit first";
    return null;
  }
  private async choose(tool: ModelingTool): Promise<void> {
    const editor = this.editor;
    if (editor.blocked || editor.isDragging || this.reason(tool)) return;
    if (
      editor.interactions.current?.kind === "body-edge-finish" &&
      (tool === "fillet" || tool === "chamfer")
    ) {
      this.edgeMode(tool);
      return;
    }
    if (editor.modeling.tool === tool && editor.interactions.current) return;
    const current = editor.interactions.current;
    if (current && !(await current.finish?.())) {
      editor.message ||= "Finish or cancel the current edit before switching tools";
      return;
    }
    if (this.reason(tool)) return;
    editor.modeling.setTool(tool);
    editor.notice = "";
    if (tool === "revolve") this.revolve();
    editor.refresh();
  }
  dispose(): void {
    this.abort.abort();
    this.menu.dispose();
    for (const dispose of this.disposers) dispose();
  }
}
