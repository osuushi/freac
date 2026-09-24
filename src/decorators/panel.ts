import type { InteractionLease } from "../sketch/active-interaction.js";
import type { SketchEditor } from "../sketch/editor.js";
import { idleReason, toolCatalog } from "../tools/catalog.js";
import { appendCustomDecorators } from "./custom-panel.js";
import { resolveFaces } from "./cylinder.js";
import { editDecorators, faceKey } from "./edits.js";
import { decoratorLibrary } from "./library.js";
import { appendThreadInformation } from "./panel-information.js";
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
  private draft: { lease: InteractionLease; edit: DecoratorEdit; valid: boolean } | null = null;
  constructor(
    private editor: SketchEditor,
    parent: HTMLElement,
  ) {
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
  private patch(patch: Settings, preview: boolean): void {
    const instances = this.instances();
    this.expand(instances);
    const edit: DecoratorEdit = { action: "settings", ids: instances.map((d) => d.id), patch };
    if (!preview) {
      void this.edit(edit);
      return;
    }
    if (!this.draft) {
      const lease = this.editor.interactions.acquire(
        "numeric",
        () => this.cancel(),
        () => this.commit(),
      );
      if (!lease) return;
      this.draft = { lease, edit, valid: false };
    }
    this.draft.edit = edit;
    try {
      this.draft.lease.show(editDecorators(this.editor.store.data, edit));
      this.draft.valid = true;
      this.editor.message = "";
    } catch (error) {
      this.draft.valid = false;
      this.editor.message = error instanceof Error ? error.message : String(error);
    }
    this.editor.refresh();
  }
  private cancel(): void {
    const draft = this.draft;
    this.draft = null;
    draft?.lease.release();
    this.key = "";
    this.editor.refresh();
  }
  private async commit(): Promise<boolean> {
    const draft = this.draft;
    if (!draft) return true;
    if (!draft.valid || !draft.lease.wait()) return false;
    const accepted = await this.edit(draft.edit);
    this.draft = null;
    draft.lease.release();
    this.key = "";
    this.editor.refresh();
    return accepted;
  }
  private field(field: (typeof threadFields)[number], instances: DecoratorInstance[]): void {
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
      input.onchange = () => this.patch({ [field.key]: input.value }, false);
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
      input.oninput = () => this.patch({ [field.key]: input.valueAsNumber }, true);
      input.onblur = () => {
        if (this.draft?.valid) void this.commit();
        else this.cancel();
      };
      input.onkeydown = (event) => {
        event.stopPropagation();
        if (event.key === "Enter") {
          event.preventDefault();
          void this.commit();
        }
        if (event.key === "Escape") {
          event.preventDefault();
          this.cancel();
        }
      };
      label.append(input);
    }
    this.root.append(label);
  }
  private update = (): void => {
    const instances = this.instances();
    const problems = (this.editor.store.data.decorators ?? []).filter((d) => d.problem);
    const last = this.editor.store.data.decorators?.find((d) => d.id === this.last);
    const canContinue = !!last && !instances.length && !this.eligibility();
    this.root.hidden =
      !!this.editor.world.active || (!instances.length && !canContinue && !problems.length);
    for (const input of this.root.querySelectorAll<HTMLInputElement>("input, select, button"))
      input.disabled =
        input.dataset.unavailable === "true" ||
        this.editor.store.busy ||
        (!!this.editor.interactions.current && !this.draft);
    if (this.draft) return;
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
    this.root.replaceChildren();
    const heading = document.createElement("h2");
    heading.textContent = "Decorators";
    this.root.append(heading);
    this.diagnostics(problems);
    if (canContinue && last) {
      this.button("Continue threads onto selection", () => {
        void this.edit({ action: "continue", id: last.id, faces: this.selected() });
      });
      return;
    }
    if (!instances.length) return;
    if (instances.some((d) => d.definition !== threadDefinition)) {
      appendCustomDecorators(this.root, this.editor, instances);
      return;
    }
    if (instances.length === 1) this.last = instances[0].id;
    this.button(`Threads · ${instances.reduce((n, d) => n + d.faces.length, 0)} faces`, () => {
      this.expand(instances);
      this.editor.refresh();
    });
    appendThreadInformation(this.root, this.editor, instances);
    if (!instances.some((d) => d.problem))
      for (const field of threadFields)
        if (
          !field.visibleWhen ||
          instances.some((d) =>
            field.visibleWhen?.values.includes(d.settings[field.visibleWhen.key]),
          )
        )
          this.field(field, instances);
    const note = document.createElement("p");
    note.textContent =
      instances.find((d) => d.problem)?.problem ??
      "Export-time threads. Original faces remain editable. Hole relief is radial; printing presets are starting points.";
    this.root.append(note);
    this.button("Remove threads from selected faces", () => {
      void this.edit({ action: "remove", faces: this.selected() });
    });
  };
  private diagnostics(instances: DecoratorInstance[]): void {
    for (const instance of instances) {
      const text = document.createElement("p");
      text.textContent = instance.problem ?? "Threads need attention";
      this.root.append(text);
      this.button("Select affected geometry", () => {
        const faces = instance.faces.filter((f) =>
          this.editor.store.data.bodies?.some(
            (b) => b.id === f.body && b.faces.some((face) => face.id === f.face),
          ),
        );
        this.editor.modeling.targets = faces.length
          ? faces.map((f) => ({ kind: "face", ...f }))
          : [...new Set(instance.faces.map((f) => f.body))].map((body) => ({ kind: "body", body }));
        this.editor.refresh();
      });
      const custom = instance.definition !== threadDefinition;
      const reassign = this.button(
        custom ? "Use selected faces for this decorator" : "Use selected faces for these threads",
        () => {
          void this.edit({ action: "reassign", id: instance.id, faces: this.selected() });
        },
      );
      reassign.disabled = custom || !!this.eligibility();
      reassign.dataset.unavailable = String(reassign.disabled);
      if (custom)
        void this.editor.store
          .inspectDecorator({
            definition: instance.definition,
            version: instance.version,
            faces: this.selected(),
            instanceId: instance.id,
          })
          .then((result) => {
            if (!reassign.isConnected) return;
            reassign.disabled = !!result.reason;
            reassign.dataset.unavailable = String(reassign.disabled);
            reassign.title = result.reason ?? "";
          })
          .catch(() => {});
      this.button(custom ? "Remove unresolved decorator" : "Remove unresolved threads", () => {
        void this.edit({ action: "discard", id: instance.id });
      });
    }
  }
  dispose(): void {
    this.disposeLibrary();
    this.cancel();
    this.unregister();
    this.editor.world.changed.delete(this.update);
    this.root.remove();
  }
}
