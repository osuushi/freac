import "./cleanup.css";
export function cleanupButton(): HTMLButtonElement {
  const button = document.createElement("button");
  button.className = "commit-cleanup";
  button.textContent = "✓ Clean up";
  button.title = "Commit and clean up · remove redundant nearby topology within each body";
  button.setAttribute("aria-label", "Commit and clean up");
  return button;
}
