import type { SketchEditor } from "../sketch/editor.js";
import { idleReason, toolCatalog } from "../tools/catalog.js";
import { appendCustomContinue } from "./custom-continue.js";
import { appendCustomDecorators } from "./custom-panel.js";
import { resolveFaces } from "./cylinder.js";
import { faceKey } from "./edits.js";
import { decoratorLibrary } from "./library.js";
import { appendThreadInformation } from "./panel-information.js";
import { appendDecoratorRepairs } from "./repair-panel.js";
import { DecoratorSettingsDraft } from "./settings-draft.js";
import { threadDefinition, threadFields } from "./thread-settings.js";
import type { DecoratorEdit, DecoratorInstance, FaceReference, Settings } from "./types.js";
import "./panel.css";

export class DecoratorPanel {
  private root = document.createElement("section");
  private unregister: () => void;
  private disposeLibrary: () => void;
  private key = "";
  private shownDocument: SketchEditor["store"]["data"] | null = null;
  private last: string | null = null;
  private advancedOpen = false;
  private draft: DecoratorSettingsDraft;
  constructor(
    private editor: SketchEditor,
    parent: HTMLElement,
  ) {
    this.draft = new DecoratorSettingsDraft(editor, () => {
      this.key = "";
    });
    this.root.className = "decorator-panel";
    this.root.setAttribute("aria-label", "Decorators");
    parent.append(this.root);
    this.disposeLibrary = decoratorLibrary(editor, parent);
    this.unregister = toolCatalog(editor).register({
      id: "threads",
      label: "Threads",
      category: "Solid",
      aliases: ["decorate", "screw", "thread"],
      description: "Editable threads on cylindrical faces; generated at mesh export",
      reason: () => idleReason(editor) ?? this.eligibility(),
      run: () => this.apply(),
    });
    editor.world.changed.add(this.update);
    this.update();
  }
  private selected(): FaceReference[] {
    return this.editor.modeling.targets.flatMap((t) =>
      t.kind === "face" ? [{ body: t.body, face: t.face }] : [],
    );
  }
  private instances(): DecoratorInstance[] {
    const keys = new Set(this.selected().map(faceKey));
    return (this.editor.store.data.decorators ?? []).filter((d) =>
      d.faces.some((f) => keys.has(faceKey(f))),
    );
  }
  private eligibility(): string | null {
    if (this.editor.world.active) return "Return to Modeling and select cylindrical faces";
    const faces = this.selected();
    if (!faces.length || faces.length !== this.editor.modeling.targets.length)
      return "Threads can only be applied to cylindrical faces";
    try {
      resolveFaces(this.editor.store.data.bodies ?? [], faces);
      return null;
    } catch (error) {
      return error instanceof Error ? error.message : String(error);
    }
  }
  private expand(instances = this.instances()): void {
    this.editor.modeling.targets = instances.flatMap((d) =>
      d.faces.map((f) => ({ kind: "face" as const, ...f })),
    );
    if (instances.length === 1) this.last = instances[0].id;
  }
  private async apply(): Promise<void> {
    const faces = this.selected();
    if (await this.edit({ action: "apply", definition: threadDefinition, faces })) {
      this.expand();
      this.editor.refresh();
    }
  }
  private async edit(edit: DecoratorEdit): Promise<boolean> {
    return this.editor.store.request({ kind: "decorator", edit });
  }
  private button(label: string, action: () => void): HTMLButtonElement {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = label;
    button.onclick = action;
    this.root.append(button);
    return button;
  }
  private patch(patch: Settings, preview: boolean, instances = this.instances()): void {
    this.expand(instances);
    const edit = { action: "settings" as const, ids: instances.map((d) => d.id), patch };
    if (preview) this.draft.preview(edit);
    else void this.edit(edit);
  }
  private field(
    target: HTMLElement,
    field: (typeof threadFields)[number],
    instances: DecoratorInstance[],
  ): void {
    const values = instances.map((d) => d.settings[field.key] ?? field.default);
    const mixed = values.some((v) => v !== values[0]);
    const label = document.createElement("label"),
      text = document.createElement("span");
    text.textContent = field.label + (field.unit ? ` (${field.unit})` : "");
    label.append(text);
    if (field.type === "enum") {
      const input = document.createElement("select");
      input.setAttribute("aria-label", field.label);
      if (mixed) input.add(new Option("Mixed", ""));
      for (const option of field.options ?? []) input.add(new Option(option.label, option.value));
      input.value = mixed ? "" : String(values[0]);
      input.onchange = () => this.patch({ [field.key]: input.value }, false, instances);
      label.append(input);
    } else {
      const input = document.createElement("input");
      input.type = "number";
      input.step = "any";
      input.setAttribute("aria-label", field.label);
      input.value = mixed ? "" : String(values[0]);
      input.placeholder = mixed ? "Mixed" : "";
      if (field.min !== undefined) input.min = String(field.min);
      if (field.max !== undefined) input.max = String(field.max);
      input.oninput = () => this.patch({ [field.key]: input.valueAsNumber }, true, instances);
      input.onblur = () => {
        void this.draft.blur();
      };
      input.onkeydown = (event) => {
        event.stopPropagation();
        if (event.key === "Enter") {
          event.preventDefault();
          void this.draft.commit();
        }
        if (event.key === "Escape") {
          event.preventDefault();
          this.draft.cancel();
        }
      };
      label.append(input);
    }
    target.append(label);
  }
  private update = (): void => {
    const instances = this.instances();
    const problems = (this.editor.store.data.decorators ?? []).filter((d) => d.problem);
    const last = this.editor.store.data.decorators?.find((d) => d.id === this.last);
    const canContinue =
      !!last &&
      !last.problem &&
      !instances.length &&
      (last.definition === threadDefinition
        ? !this.eligibility()
        : this.selected().length > 0 &&
          this.selected().length === this.editor.modeling.targets.length);
    this.root.hidden =
      !!this.editor.world.active || (!instances.length && !canContinue && !problems.length);
    for (const input of this.root.querySelectorAll<HTMLInputElement>("input, select, button"))
      input.disabled =
        input.dataset.unavailable === "true" ||
        this.editor.store.busy ||
        this.draft.waiting ||
        (!!this.editor.interactions.current && !this.draft.active);
    if (this.draft.active) return;
    const key = JSON.stringify([
      instances,
      problems,
      canContinue,
      this.selected(),
      this.editor.store.decoratorSources,
    ]);
    if (key === this.key && this.shownDocument === this.editor.store.data) return;
    this.key = key;
    this.shownDocument = this.editor.store.data;
    const advanced = this.root.querySelector<HTMLDetailsElement>("details.thread-advanced");
    if (advanced) this.advancedOpen = advanced.open;
    this.root.replaceChildren();
    const heading = document.createElement("h2");
    heading.textContent = "Decorators";
    this.root.append(heading);
    appendDecoratorRepairs(this.root, this.editor, problems);
    if (canContinue && last) {
      if (last.definition !== threadDefinition) {
        appendCustomContinue(this.root, this.editor, last, this.selected());
        return;
      }
      this.button("Continue threads onto selection", () => {
        void this.edit({ action: "continue", id: last.id, faces: this.selected() });
      });
      return;
    }
    if (!instances.length) return;
    if (instances.length === 1) this.last = instances[0].id;
    const custom = instances.filter((d) => d.definition !== threadDefinition);
    if (custom.length) {
      appendCustomDecorators(this.root, this.editor, custom, this.draft, (group, patch, preview) =>
        this.patch(patch, preview, group),
      );
    }
    const threads = instances.filter((d) => d.definition === threadDefinition);
    if (threads.length) this.appendThreads(threads);
  };
  private appendThreads(instances: DecoratorInstance[]): void {
    this.button(`Threads · ${instances.reduce((n, d) => n + d.faces.length, 0)} faces`, () => {
      this.expand(instances);
      this.editor.refresh();
    });
    appendThreadInformation(this.root, this.editor, instances);
    if (!instances.some((d) => d.problem)) {
      const advanced = document.createElement("details");
      advanced.className = "thread-advanced";
      advanced.open = this.advancedOpen;
      const summary = document.createElement("summary");
      summary.textContent = "Advanced";
      advanced.append(summary);
      for (const field of threadFields) {
        if (
          field.visibleWhen &&
          !instances.some((d) =>
            field.visibleWhen?.values.includes(d.settings[field.visibleWhen.key]),
          )
        )
          continue;
        const basic = ["preset", "hand", "cut", "clearance"].includes(field.key);
        this.field(basic ? this.root : advanced, field, instances);
        if (field.key === "clearance") {
          const hint = document.createElement("p");
          hint.className = "thread-clearance-hint";
          hint.textContent =
            "Moves hole threads outward, away from the rod. FDM fine starts at 0.25 mm; adjust for your printer and orientation.";
          this.root.append(hint);
        }
      }
      this.root.append(advanced);
    } else {
      const note = document.createElement("p");
      note.textContent = instances.find((d) => d.problem)?.problem ?? "";
      this.root.append(note);
    }
    this.button("Remove threads from selected faces", () => {
      const keys = new Set(instances.flatMap((d) => d.faces.map(faceKey)));
      void this.edit({
        action: "remove",
        faces: this.selected().filter((f) => keys.has(faceKey(f))),
      });
    });
  }
  dispose(): void {
    this.disposeLibrary();
    this.draft.cancel();
    this.unregister();
    this.editor.world.changed.delete(this.update);
    this.root.remove();
  }
}
