import type { SketchEditor } from "../sketch/editor.js";
import { type Category, categories, toolCatalog } from "./catalog.js";
import { borrowToolFocus, restoreToolFocus, toolMenuOpen } from "./menu-focus.js";
import { searchTools } from "./search.js";
import "./menu.css";

export class ToolMenu {
  private trigger = document.createElement("button");
  private backdrop = document.createElement("div");
  private panel = document.createElement("section");
  private input = document.createElement("input");
  private back = document.createElement("button");
  private list = document.createElement("div");
  private abort = new AbortController();
  private category: Category | null = null;
  private rows: { id: string; element: HTMLButtonElement; activate: () => void }[] = [];
  private selected = 0;
  private signature = "";
  constructor(
    private editor: SketchEditor,
    app: HTMLElement,
  ) {
    this.trigger.className = "tools-trigger";
    this.trigger.innerHTML = `Tools <kbd>${this.shortcut("⌘F")}</kbd>`;
    this.trigger.setAttribute("aria-label", "Tools");
    this.trigger.setAttribute("aria-haspopup", "dialog");
    this.trigger.setAttribute("aria-expanded", "false");
    this.backdrop.className = "tool-menu-backdrop";
    this.backdrop.hidden = true;
    this.panel.className = "tool-menu";
    this.panel.setAttribute("role", "dialog");
    this.panel.setAttribute("aria-modal", "true");
    this.panel.setAttribute("aria-label", "Find a tool");
    this.input.type = "search";
    this.input.placeholder = "Find a tool…";
    this.input.setAttribute("aria-label", "Find a tool");
    this.input.setAttribute("role", "combobox");
    this.input.setAttribute("aria-controls", "tool-results");
    this.input.setAttribute("aria-expanded", "true");
    this.input.autocomplete = "off";
    this.input.spellcheck = false;
    this.list.id = "tool-results";
    this.list.setAttribute("role", "listbox");
    this.list.setAttribute("aria-label", "Tools and categories");
    this.back.className = "tool-menu-back";
    this.back.onclick = () => {
      this.category = null;
      this.input.value = "";
      this.render(true);
      this.input.focus();
    };
    this.input.oninput = () => this.render(true);
    this.panel.append(this.input, this.back, this.list);
    this.backdrop.append(this.panel);
    app.append(this.trigger, this.backdrop);
    this.trigger.onclick = () => this.open();
    this.bindEvents();
    editor.world.changed.add(this.update);
  }
  private bindEvents(): void {
    const options = { capture: true, signal: this.abort.signal };
    window.addEventListener("keydown", this.keydown, options);
    window.addEventListener(
      "touchend",
      (event) => {
        if (!this.trigger.contains(event.target as Node)) return;
        // WebKit suppresses the compatibility click after the prevented pointerdown.
        event.preventDefault();
        event.stopImmediatePropagation();
        this.open();
      },
      { ...options, passive: false },
    );
    // Stop document-level outside-click handlers from accepting/cancelling local edits.
    window.addEventListener(
      "pointerdown",
      (event) => {
        if (event.target === this.trigger || this.trigger.contains(event.target as Node)) {
          event.preventDefault();
          event.stopImmediatePropagation();
        } else if (toolMenuOpen()) {
          event.stopImmediatePropagation();
          if (!this.panel.contains(event.target as Node)) event.preventDefault();
        }
      },
      options,
    );
    window.addEventListener(
      "click",
      (event) => {
        if (this.trigger.contains(event.target as Node)) {
          event.preventDefault();
          event.stopImmediatePropagation();
          this.open();
          return;
        }
        if (toolMenuOpen() && !this.panel.contains(event.target as Node)) {
          event.preventDefault();
          event.stopImmediatePropagation();
          this.close();
        }
      },
      options,
    );
  }
  private open(): void {
    if (this.editor.isDragging || toolMenuOpen()) return;
    borrowToolFocus();
    this.category = null;
    this.input.value = "";
    this.backdrop.hidden = false;
    this.trigger.setAttribute("aria-expanded", "true");
    this.render(true);
    this.input.focus();
  }
  private close(): void {
    this.backdrop.hidden = true;
    this.trigger.setAttribute("aria-expanded", "false");
    restoreToolFocus();
  }
  private keydown = (event: KeyboardEvent): void => {
    if (event.target instanceof Element && event.target.closest(".agent-dock")) return;
    if ((event.metaKey || event.ctrlKey) && !event.altKey && event.key.toLowerCase() === "f") {
      event.preventDefault();
      event.stopImmediatePropagation();
      if (!toolMenuOpen()) this.open();
      else this.input.focus();
      return;
    }
    if (!toolMenuOpen()) return;
    event.stopImmediatePropagation();
    if (event.isComposing) return;
    const key = event.key;
    if (["Escape", "ArrowDown", "ArrowUp", "Enter", "Tab"].includes(key)) event.preventDefault();
    if (key === "Escape") this.close();
    else if (key === "ArrowDown" || key === "ArrowUp") {
      this.selected =
        (this.selected + (key === "ArrowDown" ? 1 : -1) + this.rows.length) %
        Math.max(1, this.rows.length);
      this.highlight();
    } else if (key === "Enter" && document.activeElement === this.back) {
      this.category = null;
      this.input.value = "";
      this.render(true);
      this.input.focus();
    } else if (key === "Enter") this.rows[this.selected]?.activate();
    else if (key === "ArrowLeft" && document.activeElement !== this.input && this.category) {
      event.preventDefault();
      this.category = null;
      this.render(true);
      this.input.focus();
    } else if (key === "ArrowRight" && !this.input.value && !this.category) {
      event.preventDefault();
      this.rows[this.selected]?.activate();
    } else if (key === "Tab") {
      const controls = [this.input, ...(this.back.hidden ? [] : [this.back])];
      const index = controls.indexOf(document.activeElement as HTMLInputElement);
      controls[(index + 1) % controls.length].focus();
    }
  };
  private update = (): void => {
    if (toolMenuOpen()) this.render(false);
  };
  private render(reset: boolean): void {
    const tools = toolCatalog(this.editor).results();
    const query = this.input.value;
    const signature = JSON.stringify([
      query,
      this.category,
      tools.map((t) => [t.id, t.label, t.unavailable]),
    ]);
    if (!reset && signature === this.signature) return;
    this.signature = signature;
    const prior = reset ? null : this.rows[this.selected]?.id;
    this.rows = [];
    this.list.replaceChildren();
    this.back.hidden = !this.category;
    this.back.textContent = `‹ All tools / ${this.category ?? ""}`;
    if (!query.trim() && !this.category) {
      for (const [category, description] of categories) {
        if (!tools.some((t) => t.category === category)) continue;
        this.row(category, category, description, false, "›", () => {
          this.category = category;
          this.render(true);
          this.input.focus();
        });
      }
    } else {
      const results = searchTools(
        query.trim() ? tools : tools.filter((t) => t.category === this.category),
        query,
      );
      let disabled = false;
      for (const { tool, explanation } of results) {
        if (tool.unavailable && !disabled) {
          disabled = true;
          const divider = document.createElement("div");
          divider.className = "tool-menu-divider";
          divider.textContent = "Unavailable in this context";
          this.list.append(divider);
        }
        this.row(
          tool.id,
          tool.label,
          [tool.category, explanation || tool.description, tool.unavailable]
            .filter(Boolean)
            .join(" · "),
          !!tool.unavailable,
          tool.shortcut ?? "",
          () => {
            if (toolCatalog(this.editor).reason(tool)) return;
            this.close();
            void toolCatalog(this.editor).invoke(tool.id);
          },
        );
      }
      if (!results.length) {
        const empty = document.createElement("p");
        empty.textContent = "No matching tools. Try another name or browse a category.";
        this.list.append(empty);
      }
    }
    this.selected = Math.max(
      0,
      this.rows.findIndex((r) => r.id === prior),
    );
    this.highlight();
  }
  private row(
    id: string,
    label: string,
    detail: string,
    disabled: boolean,
    key: string,
    activate: () => void,
  ): void {
    const element = document.createElement("button");
    element.type = "button";
    element.tabIndex = -1;
    element.id = `tool-result-${this.rows.length}`;
    element.dataset.command = id;
    element.setAttribute("role", "option");
    element.setAttribute("aria-label", label);
    element.setAttribute("aria-disabled", String(disabled));
    const title = document.createElement("strong"),
      description = document.createElement("small"),
      shortcut = document.createElement("kbd");
    title.textContent = label;
    description.textContent = detail;
    shortcut.textContent = this.shortcut(key);
    element.append(title, shortcut, description);
    const index = this.rows.length;
    element.onclick = () => {
      this.selected = index;
      this.highlight(false);
      activate();
    };
    element.onpointermove = () => {
      this.selected = index;
      this.highlight(false);
    };
    this.rows.push({ id, element, activate });
    this.list.append(element);
  }
  private highlight(scroll = true): void {
    this.rows.forEach((row, index) => {
      row.element.setAttribute("aria-selected", String(index === this.selected));
    });
    const row = this.rows[this.selected];
    if (row) {
      this.input.setAttribute("aria-activedescendant", row.element.id);
      if (scroll) row.element.scrollIntoView({ block: "nearest" });
    } else this.input.removeAttribute("aria-activedescendant");
  }
  private shortcut(value: string): string {
    return /Mac|iPhone|iPad/.test(navigator.platform)
      ? value
      : value.replaceAll("⇧", "Shift+").replaceAll("⌘", "Ctrl+");
  }
  dispose(): void {
    if (toolMenuOpen()) this.close();
    this.abort.abort();
    this.editor.world.changed.delete(this.update);
    this.trigger.remove();
    this.backdrop.remove();
  }
}
