import "./step-export.css";

export function stepExportChoice(): {
  choice: Promise<"decorated" | "exact" | null>;
  cancel: () => void;
} {
  const dialog = document.createElement("dialog");
  dialog.className = "step-export-choice";
  dialog.setAttribute("aria-label", "STEP export with decorators");
  const heading = document.createElement("h2");
  heading.textContent = "Export STEP with decorators";
  const explanation = document.createElement("p");
  explanation.textContent =
    "Including decorators preserves their final shape as AP242 meshes. Decorated bodies remain meshes, " +
    "rather than smooth CAD solids, and some apps may not open them. Undecorated bodies stay exact.";
  const exactExplanation = document.createElement("p");
  exactExplanation.textContent =
    "For smooth editable solids, export exact bodies only. This omits all decorators, including threads, knurling and gears.";
  const buttons = document.createElement("div");
  let finish!: (choice: "decorated" | "exact" | null) => void;
  const choice = new Promise<"decorated" | "exact" | null>((resolve) => {
    finish = (result) => {
      dialog.remove();
      resolve(result);
    };
  });
  for (const [label, result] of [
    ["Include decorators", "decorated"],
    ["Exact bodies only", "exact"],
    ["Cancel", null],
  ] as const) {
    const button = document.createElement("button");
    button.textContent = label;
    button.onclick = () => finish(result);
    buttons.append(button);
  }
  dialog.oncancel = (event) => {
    event.preventDefault();
    finish(null);
  };
  dialog.onkeydown = (event) => {
    event.stopPropagation();
    if (event.key === "Escape") {
      event.preventDefault();
      finish(null);
    }
  };
  dialog.append(heading, explanation, exactExplanation, buttons);
  document.body.append(dialog);
  dialog.showModal();
  return { choice, cancel: () => finish(null) };
}
