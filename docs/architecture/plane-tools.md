# Construction planes and plane cuts

Founder-corrected interaction, 2026-09-21. This replaces the original
offset-panel interaction.

Construction planes are independent saved document objects with stable IDs and
orthonormal PlaneFrames. With one planar face selected, Construction plane immediately
creates a plane on that face in one Undo step. Otherwise it picks a world plane,
planar face or saved plane in the viewport. Local translation/rotation controls
place the temporary plane; Enter or leaving the tool accepts, Escape cancels.
There is no plane-offset panel. Reselection supports movement, deletion, visibility
and sketch entry. Visibility remains view state.

A sketch begun on a plane copies its evaluated frame and is created on the first
completed drawing gesture. Subsequent plane movement or deletion does not move or
delete sketches or solids. There is no dependency on the original reference face.

Imprint is enabled only for one or more selected faces. Split Body uses the bodies
identified by selected faces or whole-body selections. Both pick a world/saved
plane or planar face directly, using its infinite support rather than its visible
boundary. The cut tools have no panel or separate offset value.

Before picking, synchronous infinite-plane/bounding-box checks identify references
crossing any selected body's bounds. No native operations run during reference
discovery. Disjoint and box-tangent planes and hidden references are excluded.
This is a broad filter: concavities, selected-face coverage and existing imprints
may leave ineffective references selectable. Exact validation runs only on picking
a reference. World/saved patches retain their normal translucent fills; candidate
outlines remain visible. Hover adds a blue fill to exactly the reference the shared
click picker would choose, including a planar face's actual boundary. Explicit
labels highlight their own reference. Hover clears on leaving, navigation or tool
exit and never changes geometry. Discovery does not create previews or alter history.
World and saved plane patches can be picked throughout their displayed interiors,
using the nearest eligible reference when patches and planar faces overlap.
Picking stays on the canvas so camera gestures remain available; labels and saved
plane outlines also remain clickable.

Clicking a valid reference produces a temporary exact preview. Enter, clicking away,
selecting another entity or toggling the active command accepts in one Undo step;
Escape cancels and restores the original selection. Another valid reference replaces
the preview. Leaving before a valid preview exits without changing geometry.

- Split Body creates separate closed bodies.
- Imprint subdivides the selected faces, creating selectable exact edges without
  removing material, adding caps or changing support surfaces. Shared boundary edges
  may subdivide to preserve valid topology.

Failures reject atomically. Automatic cleanup must not erase deliberate imprints;
explicit cleanup remains a separate edit. Acceptance covers selected face sets,
curved/oblique/hollow geometry, exact no-op handling on preview, actual reference picking,
subsequent edge editing, cancellation, Undo/Redo and Save/Open.

Volume conservation retains a relative allowance of 1e-7 (with a unit-volume
floor). Estimated integration errors consume that allowance. If ordinary adaptive
integration disagrees, retry with spline-span Gauss–Kronrod integration from a
shared exterior reference plane. This changes measurement only; source geometry,
split topology and validation precision remain unchanged.
