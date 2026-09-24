# Sketch → solid → sketch

Proposed interaction and implementation plan, 2026-09-15. The founder considers
sketching useful enough for real design and requested planning this next loop.
This is a design review, not authorization to implement all solid tools or a claim
that sketch v1 is complete. Further work follows current user requests.

## First usable outcome

Draw a plate outline with circular/arc holes. Leave planar editing, select one or
several filled regions and extrude. Double-click a planar face, draw a slot, orbit
out and cut it. Make a cut that divides the body into two pieces. Select a planar
face on either result, including a face containing a hole, and keep drawing.
Save/reopen and continue that same loop; Undo reverses one accepted modeling edit.

This entire route is the first solid-tool product checkpoint. An isolated box
extrusion is an intermediate implementation result, not the review endpoint.

## Confirmed separation: sketch objects and body geometry

Founder decision, 2026-09-15: sketching and modeling have a clear modal boundary.
Modeling selects/moves sketch objects and operates on their regions; sketching
edits their curves and constraints. Limited curve edits in modeling can come
later. A sketch has its own identity and placement, so multiple sketches may
occupy the same plane. Plane equality is not sketch identity.

A body created from a sketch is independent of that visible sketch. Moving,
editing, trimming, clearing or deleting the sketch does not alter an existing
body. Reusing the sketch creates another result. Bodies store materialized exact
geometry; hidden parametric source copies are not part of the chosen model.

## Interaction proposal

| Context | Action and result |
| --- | --- |
| Planar sketch editing | Existing drawing and editing behavior stays. Extrude is unavailable. Orbiting out or leaving sketch editing preserves completed geometry. |
| 3D, sketch region hovered | Highlight the exact region under the pointer, including holes; click selects it. Shift adds regions; Cmd/Ctrl toggles. Selection does not mean selecting/moving every curve along that boundary. |
| Selected coplanar regions | A local normal handle offers extrusion. Drag for distance or click for numeric entry. Adjacent selected regions form their combined footprint; disjoint regions remain separate sweep components. |
| Active extrusion | Distance and U/S/I/N controls stay by the handle. Drag release keeps the result temporary. Numeric Enter accepts the number while retaining the tool. Camera navigation remains available. |
| Complete extrusion | Proposed: Enter outside a field or a small local accept control commits. Clicking another target completes the valid extrusion and then performs the intended selection; double-clicking a face completes it and enters sketching there. |
| Cancel extrusion | Proposed: Escape or the local cancel control discards the whole extrusion. Invalid previews cannot complete. Window focus loss neither commits nor discards. |
| Planar body face | Single-click selects the face and offers local actions. Double-click enters sketching on its infinite supporting plane. Existing face-workspace drawing reappears. Pan/pinch retain sketch mode; Command-drag orbit exits it. |
| Curved face | Selectable body geometry, but no planar-sketch entry inferred from a triangle. Revolve/project/other tools get their own designs later. |

Two-step numeric Enter prevents accepting the solid while someone is only setting
its distance. Capturing the intended next click before retiring the extrusion
avoids losing the face the user wanted to sketch on. Never reinterpret a stale
face hit against changed geometry; resolve the next target in the accepted result.

### Boolean behavior and targets

Distance direction and Boolean operation are independent. Default New body when
there is no positive-volume intersection; default Subtract when any body overlaps
with positive volume. Contact alone is not overlap. U/S/I/N explicitly chooses
union/subtraction/intersection/new body and stays chosen for the session. Bridging
heuristics and XOR remain deferred, as already agreed.

Use all intersected bodies as initial Boolean targets and visibly highlight them.
A compact local target-selection action allows excluding bodies; do not silently
operate on only the first body found. Preview the actual retained solids, not just
a translucent sweep that hides a split. Recalculate from the accepted inputs on
every adjustment, never from the previous preview.

Union includes touching participants when the kernel can make a valid union.
Subtract/Intersect apply to each chosen target and the combined sweep tool; gather
all valid output solids. Split outputs are individually selectable bodies. An empty
intersection or complete removal is shown as an empty result with a clear local
notice; only explicit completion removes the targets. Kernel failure is an error,
not an empty result. New body retains all existing bodies.

Initial multi-selection requires coplanar profiles/faces with a shared extrusion
axis. Noncoplanar selection explains the limitation instead of silently choosing
an axis. Extruding a selected planar body face sweeps its actual trimmed footprint,
including inner wires, through the same tool/Boolean path. General face movement
is a later direct-edit tool, not an implicit post-extrusion transition.

### Continuing face workspaces

Every geometrically planar result face is eligible, regardless of whether it came
from extrusion, a Boolean cut, or a later operation. Eligibility cannot depend on
recognizing a box cap or a stored feature label. Its finite boundary is context,
not a drawing limit; users can draw beyond the face or over its holes.

Keep the world origin visible and the active infinite grid in the same scene.
Choose a stable in-plane orientation on first entry, then retain it through
re-entry; do not use a remeshed triangle or changing face centroid as the origin.
Face edges are visible and can provide geometric snaps, with Option bypass. Merely
snapping to a body edge does not silently create a cross-body constraint. If a body
edge is needed to close an extrusion profile, explicitly copy/project it into the
sketch; propose a local “Use edge” action creating ordinary editable curves for B1.

Face entry establishes a plane and stable placement for a sketch object.
Whether later body movement also moves a sketch originally drawn on its face is
not settled. Recommendation: initial placement rather than automatic attachment;
explicitly move the sketch independently or select sketch and body to move together.
This avoids introducing an inverse dependency after deliberately removing the
sketch-to-body dependency. Face eligibility and convenient sketch re-entry still
matter, but mandatory persistent support repair is no longer an assumed B1 task.

Consumed sketch regions should not intercept clicks on the resulting body in 3D.
Restore the drawing on sketch re-entry; leave unused regions available for further
operations. Visibility is presentation state, not deletion of source geometry.

## Model and responsibility boundaries

The current curve model already stores a `PlaneFrame`. The active camera/editor
still uses `PlaneId = XY | XZ | YZ`; `sketchOn` uses exact frame equality. Replace
that assumption with an explicit active workspace/frame before face sketching.
World-plane presets remain convenient entry targets. A selected support need not
create saved sketch data until the user actually draws.

| Concept | Owns |
| --- | --- |
| Sketch workspace | Stable ID, local curve/constraint data and independently movable placement. Drawing data remains the existing ordinary sketch model. |
| Selected region | Temporary workspace-qualified boundary spans, outer wire and inner wires derived from the current curve arrangement. Not a persisted render-cell number. |
| Extrusion input | Independent exact boundary copy and placement, signed distance, Boolean mode and explicit participant IDs for the active operation. Temporary operation data; accepted bodies do not depend on a saved recipe. |
| Body | Stable document-local ID and accepted exact solid geometry. One operation may produce zero, one or many bodies. Meshes are derived. |
| Face selection/support | Current body-qualified exact face identity and plane/provenance, distinct from triangle indexes. Persistent sketch attachment is not assumed; geometric plane eligibility is independent of history. |
| Document owner | One accepted model, temporary operation candidate and snapshot Undo; validates all affected results before accepting them together. |
| Native kernel adapter | Exact wire/face construction, sweeps, Booleans, validation, topology queries and tessellation. No second application document or Undo stack. |

Recommend keeping TypeScript application ownership and adding a narrow C++/OCCT
calculator, alongside the existing PlaneGCS calculator. This is a recommendation
for B1, not a decision to rewrite application policy in C++. Reuse bounded geometry
lessons from the [kernel compendium](freecad/kernel-topology.md); do not restore the
prototype's command/revision architecture or feature-specific face restrictions.
Pin and package the chosen kernel during implementation; historical builds are
not evidence that the current app already supports solids or every target OS.

### Selected direction: materialized exact bodies

Founder decision, 2026-09-15: the accepted exact BRep is the body, independent of
visible sketches. No private parametric history or executable generator is required
to load, display or edit it. A hole-size correction edits the current cylindrical
faces; it does not require regenerating the original sketch and downstream cuts.
Direct radius/diameter editing gets its own interaction and kernel-validation brief.

Manual tools and the coding agent use the same explicit modeling operations and
geometry queries. Both can identify holes, change radii, select groups of faces
and validate results. Useful analytic geometry and labels provide addressability;
construction-history replay is not the basis of agent access.

Operation inputs belong to the temporary adjustment session. Committing stores
exact results and necessary identity/metadata changes atomically. Undo restores
before/after model snapshots without replay. Save exact body geometry, identity
records and movable sketches; preserve current sketch-file opening. Descriptive
provenance may remain where useful, but is not a promise of executable history.

### Face/edge identity and future labels

Founder requirement: eventually users and agents can label individual faces and
groups of faces, then target those labels in explicit post-processing. Edge identity
also needs to be understood across operations. Build a narrow correspondence
contract into each implemented solid edit, not a universal naming system ahead of B1.

Proposed rules for review:

- Face/edge IDs are document-local, body-qualified identities separate from mesh
  indexes and kernel enumeration order. Display tessellation cannot change them.
- Each operation returns correspondence for unchanged/modified, split, merged,
  deleted and newly generated topology. Preserve an ID for an unambiguous
  continuation; give new entities fresh IDs and explicit predecessor references
  where needed. Missing or ambiguous correspondence is an explicit result.
- Splits and merges are relations, not a one-to-one rename map. A group label can
  potentially follow several descendants, while an individual-face reference may
  need resolution. These are different behaviors; do not silently choose a child
  or assume every label should propagate to every descendant.
- Many-to-one merges can combine incompatible meanings. Keep that conflict
  visible rather than silently overwriting a label. Deleted references remain
  diagnosable; do not retarget labels to a nearby geometric match.
- Accept geometry, identity mapping and label changes together; Undo and save/open
  preserve that correspondence. Exact serialized shape topology needs a verified
  identity association on reload, not an assumption about face enumeration order.

Only the current identity state and correspondence needed by references need be
retained. This is not an obligation to save an unbounded operation graph or replay
construction history. Kernel history is evidence for a mapping, not a guarantee
of a unique semantic successor. See the existing kernel compendium for previously
recorded topology-mapping limitations; no new upstream behavior is asserted here.

### Deferred explicit post-processing

Later scripts may target labels to make final modifications, for example replacing
labeled surfaces with matching involute gear geometry. They run explicitly on the
current materialized model, then produce a candidate that can be accepted/undone.
They are not an automatic regeneration step or a prerequisite for opening a file.

Shareable files must remain usable without executing their scripts. The founder
requires adequate warnings for untrusted embedded scripts. Warnings alone are not
an execution boundary: permissions/isolation, resource limits, cancellation and
candidate validation need a dedicated design before script support. Agent code in
a development environment is distinct from executable content received in a CAD
file. This deferred direction does not authorize a scripting engine in B1.

## Bounded delivery sequence

| Increment | Complete route and acceptance |
| --- | --- |
| 1. Regions and arbitrary workspaces | Select exact line/circle/arc cells, including annuli, nested holes, adjacent and disjoint selections. Highlight and selected footprint agree. Enter an offset/rotated workspace through an explicit temporary test fixture and draw/edit/re-enter with unchanged coordinates. Move whole sketch objects in modeling mode; preserve ordinary curve editing within sketch mode. |
| 2. First exact solid and face return | Selected profiles become exact new bodies with outlines and face picking; double-click any planar result face and use the existing sketch editor there. Include side/bottom/rotated faces and holes, signed extrusion, drag/type/cancel/Undo, and multi-profile selection. Integrate the native adapter only as required for this route. |
| 3. Boolean modeling loop | U/S/I/N, visible target sets, selected planar-face inputs, splits and empty results. Cut the plate, sketch on cut-result faces, repeat. Add “Use edge” for profile closure from body geometry. Preserve source drawing and click-through visibility. |
| 4. Continuing edits and durability | Move/edit/delete source sketches without changing bodies. Re-enter sketches by identity, reuse their regions, and exercise body editing, Undo/Redo and save/reopen. Verify identity correspondence through splits/merges and save/open; settle face attachment separately. Finish the plate→hole→split→face-sketch review route. |

Each increment gets a short implementation brief and coherent tested commits;
implement input-to-geometry behavior before extending another layer. Keep the first
slice runnable within an hour; reassess scope when a slice would exceed two hours.
These are planning budgets, not a promise of finishing B1 in four hours. No separate
proof queue or standalone naming/framework project precedes the visible loop.

Routine acceptance uses real kernel calculations and pointer/keyboard controls in
headless Chromium/WebKit, plus hidden Electron at the checkpoint. Geometry checks
include volume, position, hole boundaries, number of solids and outward normals;
volume alone cannot prove the body is in the right place. Physical iPad and
Linux/Windows builds remain explicit platform checks, not implied by desktop runs.

## Review decisions before implementation

Materialized bodies and independent visible sketches are selected. Review the
identity/label propagation rules above and face-entry placement versus lasting attachment.
Then confirm the complete/exit convention (numeric Enter stays in extrusion;
viewport Enter or another selection completes; Escape cancels) and the first B1
implementation brief before proceeding beyond planning.

The other previously agreed behaviors—local controls, positive-overlap Subtract,
U/S/I/N, multiple output bodies, and unrestricted planar-face eligibility—carry
forward without reopening them. This plan makes no new upstream implementation
claim and changes no runtime code.
