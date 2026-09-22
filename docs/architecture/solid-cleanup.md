# Explicit solid cleanup

Read for work in this area, not on every resume. [Architecture index](../architecture.md).
Later founder decisions override earlier proposals.
Cubic editing/projection (2026-09-16) supersedes any earlier spline exclusion.

## Explicit solid cleanup (founder decision, 2026-09-16)

Cleanup stays within each body. Joining touching bodies is a separate Union;
cleanup never changes that choice, including when completing an extrusion.
Extrude, Revolve, Boolean, Fillet/Chamfer and face offset offer a separate local
**Commit and clean up** action. Ordinary completion preserves subdivisions.
The Fillet/Chamfer broom also stays disabled when its candidate has no removable
topology. After 250 ms without another valid size preview, a serialized read-only
kernel cleanup check uses the same operation-local scope as completion. It shows
a spinner while pending, ignores superseded results, and never replaces the preview
or changes Undo. A check failure leaves ordinary acceptance available.

Offset's established contact-absorption behavior still merges the contacted faces;
an ordinary offset without absorption no longer refines the whole body.

Modal cleanup considers newly created/changed faces and edges, plus surviving
edges of consumed faces. It does not recursively spread through older subdivisions.
**Clean up selection** previews selected body topology, explicitly selected edges,
and edges incident to selected faces. Unselected face boundaries are protected;
redundant neighboring edge breakpoints at eligible endpoints may also disappear.
Kernel-only periodic seams can reconnect as cylindrical walls merge.

The native kernel unifies coincident supporting surfaces/curves without approximate
surface fitting or spline concatenation. It validates the solid and volume, returns
face/edge correspondence, and retains body identity. DocumentOwner alone accepts
geometry and owns Undo: operation plus cleanup is one step, selection cleanup is
one step, and an unchanged result adds none. A failed cleanup during completion
keeps the operation candidate available for ordinary acceptance or cancellation.
