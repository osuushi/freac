import type { SketchEditor } from "../sketch/editor.js";
import { modelingKey } from "../sketch/model-selection-state.js";
import type { TagControls } from "./controls.js";
import { tagStatus } from "./model.js";

export class TagRows {
  private expanded = new Set<string>();
  constructor(
    private editor: SketchEditor,
    private controls: TagControls,
  ) {}
  wrap(row: HTMLElement, body: string, refresh: (() => void)[]): HTMLElement {
    const groups = this.editor.store.data.taggedGroups?.filter((g) => g.body === body) ?? [];
    if (!groups.length) return row;
    const wrapper = document.createElement("div"),
      children = document.createElement("div"),
      toggle = document.createElement("button");
    children.className = "tag-children";
    children.hidden = !this.expanded.has(body);
    toggle.className = "tag-disclosure";
    toggle.setAttribute("aria-label", "Toggle tagged groups");
    const display = () => {
      toggle.textContent = children.hidden ? "▸" : "▾";
      toggle.setAttribute("aria-expanded", String(!children.hidden));
    };
    toggle.onclick = () => {
      children.hidden = !children.hidden;
      if (children.hidden) this.expanded.delete(body);
      else this.expanded.add(body);
      display();
    };
    display();
    row.append(toggle);
    for (const group of groups) {
      const button = document.createElement("button");
      button.className = "tag-row";
      button.textContent = group.name + (tagStatus(group) ? " ⚠" : "");
      button.title = [group.description, tagStatus(group)].filter(Boolean).join("\n");
      button.setAttribute("aria-label", `Select group ${group.name}`);
      button.onclick = (event) => void this.controls.select(group, event);
      button.onkeydown = (event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          this.controls.begin(group);
        }
      };
      button.ondblclick = (event) => {
        if (!event.shiftKey && !event.ctrlKey && !event.metaKey) this.controls.begin(group);
      };
      refresh.push(() => {
        const selected = new Set(this.editor.modeling.targets.map(modelingKey));
        button.setAttribute(
          "aria-pressed",
          String(group.members.length > 0 && group.members.every((m) => selected.has(m.id))),
        );
        button.disabled = this.editor.blocked || !!this.editor.interactions.current;
      });
      children.append(button);
    }
    wrapper.append(row, children);
    return wrapper;
  }
}
