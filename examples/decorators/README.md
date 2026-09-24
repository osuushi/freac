# JavaScript decorator example

Import `raised-pad.json` with **Decorator library → Import decorator bundle**.
Select a planar face, enable the bundled code, then apply **Raised pad**. Width
and height appear in the decorator panel. Export STL or 3MF to generate the pad;
the original face remains editable. The example is deliberately simple: place it
on a face large enough for the pad, with its plane normal pointing outward.

The JSON bundle contains `id`, positive integer `version`, `name`, `fields`,
optional `preview: true`, and a self-contained ES module in `source`. Installation
and document opening do not run source. Enablement applies to the exact source
bytes for that ID/version and is cleared on opening a document. Source replacement
is a document edit with Undo; code is never fetched from a network or an installed
package at export time.

The module's default export supplies synchronous methods:

- `partition(context)` returns `{ groups: [{ faces, state? }] }`, or `{ reason }`.
  Groups must cover every selected face exactly once, with one body per group.
- `validate(context)` returns diagnostics, each with `severity` (`warning` or
  `error`), `message`, and optional `faces` to highlight. Errors prevent generation.
- `preview(context)` returns a triangle mesh or `null` when the manifest enables
  preview. Open meshes are allowed for preview.
- `generate(context)` returns `{ operation: "add" | "subtract", mesh }[]`.
  Each modifier must be a closed, consistently oriented triangle mesh. Empty
  modifications are allowed. Coordinates are in world millimeters.

Every context includes `units`, `selection`, `bodies`, `instance`, and resolved
`settings`. Bodies expose current analytic plane/cylinder descriptors, face
triangles, edges/curves, bounds and measurements. They omit the opaque BRep string.
The context is a JSON copy, so changes to it cannot mutate the document. Preview
and export additionally provide `quality` and a suggested `tolerance` in mm.
No hook receives another decorator's result. JavaScript has no host, DOM, file,
network, timer or module-import APIs; bundle any helpers into the source itself.

This interface is under active implementation. Generic topology continuation,
disabled-reason queries, diagnostic highlighting, and agent authoring integration
are not complete yet. The built-in thread decorator currently has the fuller
interaction and continuation support.
