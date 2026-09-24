# JavaScript decorator example

Import `raised-pad.json` with **Decorator library → Import decorator bundle**.
Select a planar face, enable the bundled code, then apply **Raised pad**. Width
and height appear in the decorator panel. Export STL or 3MF to generate the pad;
the original face remains editable. The example is deliberately simple: place it
on a face large enough for the pad, with its plane normal pointing outward.

`linked-pads.json` groups selected planar faces within each body. Select one of its
decorated faces, then select an undecorated planar face and use **Continue decorator
onto selection**. Removing decoration from one selected face leaves the other
members intact. This example uses each face's outward offset normal and generates
a pad on every group member.

The library's source disclosure displays the exact bundled module. **Export bundle**
saves a portable JSON copy. Unused bundles can be removed with Undo; bundles still
referenced by decorations must have those decorations removed first. Importing the
same ID/version replaces its source and schema as one Undoable edit.

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
  `error`), `message`, and optional `faces` (`{body,face}` references) and `edges`
  (`{body,edge}` references) to highlight within selected bodies. Errors prevent generation.
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

The library checks eligibility before enabling Apply and displays the hook's
reason for an unsupported selection. Diagnostic face references become a
**Show affected faces** action in the settings panel. The example warns when
the pad's footprint area exceeds the supporting face's area; this is a simple
size check, not a general containment or collision test.

Geometry edits carry attachments to compatible descendants and run partition and
validation again with their prior settings/state and transported frame. A split
can produce independent groups; ambiguous merges remain unresolved. Enable code
and use **Use selected faces for this decorator** to repair an unresolved attachment.
Disabled code is never executed merely because geometry changed.

Agents use `freac.decorators()` to inspect the current script candidate, including
source/schema, instances and source-specific enablement. `editDecoratorDefinition`
installs/removes bundles; `enableDecorator` explicitly enables exact source;
`inspectDecorator` returns eligibility, groups and highlighted diagnostics;
`editDecorator` applies the same settings/membership edits as the UI. All calls are
awaited. A successful script accepts document edits as one Undo step; failed or
cancelled scripts discard both candidate edits and pending enablement. Ordinary
`freac inspect` also lists definitions, built-in schema and instances. The installed
`freac docs` includes the hook authoring contract; `freac types` contains the actual
public scripting declarations.
