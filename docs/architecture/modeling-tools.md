# Selection-driven modeling tools

Read for work in this area, not on every resume. [Architecture index](../architecture.md).
Later founder decisions override earlier proposals.
Cubic editing/projection (2026-09-16) supersedes any earlier spline exclusion.

## Implicit revolution axes

Revolve picks straight sketch/solid edges, cylindrical faces (including partial
cylinders), or world axes. Explicit finite edges have priority, then the nearest
visible face's exact cylinder axis, then world axes. A planar face in front of a
cylinder does not expose the cylinder through it; hidden bodies do not participate.
The evaluated axis must lie in the section plane. Hover shows the implied center
axis and direction only for a valid candidate; leaving the canvas clears it.
Changing the axis allows selecting the same reference again and restores a fresh
preview. Inputs copy the evaluated native axis; no saved axis object or dependency
on the reference body is introduced. Existing angle/height, acceptance and Undo apply.

## Selection, operations and tools (founder decision, 2026-09-17)

Selection records ordered user targets. `selection-context.ts` derives complete
body coverage, partial faces and explicit edges from accepted stable topology IDs;
it does not replace that selection or own document data. A body token and all its
faces describe equivalent coverage. Redundant targets are deduplicated, preserving
first encounter order for Boolean operands and existing face order for face tools.

An operation is a document change with concrete targets and parameters. The typed
`OperationInputs`/`Resolution` contract in `operation-selection.ts` resolves current
selection to all required inputs or an unavailable reason. Toolbar eligibility,
shortcuts and operation controllers use this same resolution. Applicability does
not promise that every parameter value will succeed; the exact kernel remains the
geometry authority. Unsupported selections never silently drop targets.

A tool is the interactive parameter-gathering and preview route for an operation.
`tool-policy.ts` owns the interactive tool IDs and default preference separately
from operation eligibility. Delete is immediate and has no ongoing tool. Move can
resolve to a body transform, component reconnection or both. Existing exclusive
interaction leases, temporary candidates and DocumentOwner acceptance remain the
only edit lifecycle; there is no new command framework or document owner.

Complete bodies prefer Move, partial face-only sets prefer Offset, explicit edges
prefer Fillet and profiles prefer Extrude, provided the preferred operation is
available. Mixed coverage has no automatic default, but can offer explicit tools.
Explicit choices survive preview replies; fresh selection restores the default.

Whole bodies and complete face coverage both expose rigid Move/Rotate, Duplicate,
Boolean, [Mirror](transforms.md#mirror-founder-approved-interaction-2026-09-20),
whole-body Delete/Cleanup, and applicable face operations. Offset expands
the coverage to its faces. Projection uses the same whole-body interpretation for
complete face coverage. Body selection does not implicitly select edges for Fillet.
For Move/Delete, edges already covered by a whole body add no second edit.

Mixed whole-body and partial face movement transforms the complete bodies rigidly
and reconnects the partial bodies, using the same translation/pivot/rotation. Mixed
whole-body and edge movement supports translation. A request computes all results
before one acceptance; failure leaves every accepted body unchanged. Partial faces
and edges together remain unavailable. Mixed Delete removes complete bodies/sketches
and heals remaining topology atomically; a failed heal removes nothing.

Refinement expands body tokens to faces where needed. Toggle-clicking a face of a
selected body removes that face and leaves the others selected; adding the missing
face restores complete-body behavior. The raw ordered selection remains inspectable.
Marquee release consumes its synthetic click before sketch-plane entry can run.

## Selection-driven modeling tools (founder decision, 2026-09-16)

In 3D, filled sketch regions default to Extrude, partial face-only selections to
Offset, complete bodies to Move, and edge-only selections to Fillet. “Sketch planes” in this
interaction means filled regions, not whole sketch objects or empty planes.
Mixed target kinds have no automatic editing tool. Show one tool's local handles
at a time; toolbar buttons and E/O/M/F explicitly choose Extrude/Offset/Move/Fillet.
Shift+F chooses Chamfer, Shift+R chooses Revolve. Fillet's local small icon button
switches to Chamfer and back, including recalculating an active candidate.
The edge-size control uses a capsule arrow with a rounded fillet or beveled chamfer contour;
the compact panel uses distinct corner icons in fixed Fillet, Chamfer order with
an active highlight, followed by accept, cancel and icon-only cleanup. The size
field stays visible above the buttons, including at zero; check and cleanup are
disabled without a valid nonzero change. Unfocused sizes display four significant
digits without reducing model precision. Tab/Shift+Tab cycles visible numeric
fields in both modeling and sketch controls. The operation anchor stays at the nearest
displayed edge point from the last click among selected edges. Its outward direction
is the incident faces' normal bisector, evaluated from nearby oriented presentation
triangles. Its glyph uses a rigid geometry frame; the drag direction is projected
into the viewport and normalized. Dragging along that direction
increases size; each gesture holds its initial direction. Orbit reprojects the widget.
A view directly along the outward axis offers typed size entry until orbit reveals
a direction. The click anchor is UI state and clears when accepted body geometry changes.
A white capsule fill and near-black outline follow the
[orientable widget guide](../design/orientable-widgets.md). Blue hover and red
geometry-limit/rejection feedback supplement the contours. Legal-size clamping
retains its valid preview and existing acceptance behavior.

Extrude and Offset share the outlined directional drawing and compact control card.
Extrude uses a lifted circular profile; Offset uses separated curved contours. Their signed
positive direction is the projected extrusion axis or material-outward face normal;
when viewed end-on, the existing upward drag fallback remains available. Each drag
holds its starting projection and scale. Distance fields remain visible at zero;
extrusion retains its draft row and fixed Boolean mode icons, followed by accept,
cancel and cleanup. Offset retains its diameter/signed-distance switch for cylinders.
Draft display rounding does not change the driving value. Both tools probe exact
cleanup availability after a trailing 250 ms debounce, preserving preview and Undo;
the broom spins while pending and disables for no-op cleanup. Rejected extrusion
and rejected/clamped offset requests turn their arrows red. Sketch-entry actions sit
below the card so the larger arrow cannot cover them.

Offset consumes disappearing boundaries rather than stopping at an old extrusion
rib. For inward planar movement, a connected wall fully crossed by the moving plane
can merge with an adjacent wall on the same plane or cylinder before retrimming.
Unreached subdivisions remain intact. This preparation is temporary with the
gesture; reversal restores them, and acceptance remains one Undo step. Merged walls
receive new identities while the continuing selected cap remains selected.
The captured legacy defect with a short open seam whose endpoints were merged is
healed on those same supports, checking unchanged volume and continuing surfaces.
New offsets reject vertex tolerances above 2e-6 mm. This is bounded boundary
absorption, not general removal of arbitrary curved faces or permission to cross
complete body collapse.

For a single planar face that normal offset construction cannot rebuild, Offset
may use the existing boundary reconnection machinery. The selected support must
translate by the requested signed normal distance, every unselected support must
remain fixed, and the strict solid checks still apply. This permits lifting an
interior cup floor without adopting Move's neighboring-face warping behavior.
The ordinary offset path runs first to preserve contact merging.
If those paths fail for a single outward planar offset, a swept-material Boolean
fallback can fill a cavity and absorb contacted coplanar caps. It uses the same
finite-face contact rule, removes consumed walls, and unifies the resulting cap.
Every result face must lie on an exact target plane or an unchanged analytic
plane/cylinder support; strict solid, interference and tolerance checks still apply.
Merged faces receive fresh IDs and remain selected. Contact is constructed at the
requested position, not approximated by the last successful bisection step.
Intentionally requested sub-contact steps remain exact; the 0.001 mm adjustment
budget does not mean snapping away real small features. A watertight solid with
an unintended residual ledge is still a failed operation outcome.

Offset also accepts verified nonanalytic supports, including spline bends and
existing offset surfaces. It prepares parameter correspondence on a deep copy,
uses local intersection joins to retain sharp caps, and reconstructs overly coarse
generated spatial boundaries from their pcurves. Every incident surface and curve
endpoint must agree within 1e-6 mm before conservative vertex bounds are tightened;
the final topology budget remains 2e-6 mm. Source geometry stays unchanged.
Every result face must correspond to a source face: selected supports match their
signed normal offset across C2 spans, unselected supports remain fixed, and continuing
face orientations agree. Exact BRep validity, positive volume/orientation, closed
boundaries, self-interference and minimum separation supplement the sampled checks.
This conservatively rejects unaccounted topology changes; it does not guarantee all
freeform offsets. Existing verified-limit clamping remains, and can be slow because
each trial repeats native construction and validation.

An explicit tool choice survives geometry preview replies. A fresh selection
restores its default. Switching tools completes a valid operation through its
existing one-step Undo route; an untouched operation can exit without an edit,
and invalid pending geometry remains recoverable. Numeric fields retain ordinary
text input; Enter leaves the extrusion/revolution field before tool hotkeys apply.
Extrude stays active through drag release and never becomes Offset mid-operation.

The toolbar's **Modify selection** submenu removes edges/faces, keeps only either
type, adds incident faces from selected edges or incident edges from selected faces,
selects owning bodies, selects the boundary of the selected face set, and clears.
Expansion retains existing ordered targets and adds unique stable topology IDs;
it uses published face-edge incidence, not visual proximity. Boundary selection
replaces the set with exterior/hole boundary edges, excluding shared interior edges.
Selection changes do not mutate geometry or create document Undo entries. Refinement
is unavailable during an active edit; finish or cancel it first.

## Delete faces and edges (founder decision, 2026-09-17)

Select solid faces/edges, then Delete/Backspace or **Delete** in the modeling tools.
Deletion calculates and accepts one closed-solid change immediately, with no modal
preview or confirmation. Undo restores it. During calculation other edits are
disabled and the ordinary busy indicator can appear; camera navigation remains
available. On failure, geometry and selection remain unchanged, the status shows
the reason, and the attempted operation and error remain in the unified history.
The user can revise selection and try again directly. Text fields retain ordinary
deletion. This supersedes the first modal deletion design on the same date.

Selected faces heal by extending neighboring surfaces, using current exact BRep,
not construction history. Select all relevant hole walls or pocket/boss walls and
floor/cap; fillet/chamfer faces can recover their supporting intersection. Edges
between matching supporting surfaces dissolve using scoped same-domain cleanup.
Sharp edges that require choosing a new replacement surface reject; no fitted
surface or open-shell mode is implied. Every selected face/edge must disappear;
partial healing and kernel warnings reject the entire edit. Mixed selections heal
faces first and dissolve surviving selected edges. Partial-body healing across multiple bodies is atomic, each retaining one valid
closed solid and its body identity. Complete body coverage instead removes that
body directly, including when selected through all its faces.

DocumentOwner owns accepted data and history. Immediate kernel correspondence
retains one-to-one topology IDs; splits/merges get new IDs. Unrelated subdivisions
remain protected in edge dissolution, as with explicit cleanup. After acceptance,
selection becomes the affected bodies because removed topology no longer exists.
Save/Open stores the healed BRep, which remains available for ordinary later edits.

## Boundary reconnection (2026-09-17)

The founder chose shared boundary reconnection as the only edge/face movement
path, replacing the limited feature reconstruction and constrained edge prototype.
Move/M always allows neighboring faces to warp; there is no mode switch or
operation flag. Unexpected surface results will be addressed as they arise in use.
World-axis translation and an optional edge boundary-normal handle remain available;
faces also have rotation. No edge rotation or movement of partial faces and edges together yet.

Each gesture or typed quantity is one axis operation. Release retains a temporary
preview. Enter/check accepts one Undo step; Escape/cross cancels. Tool switching
finishes only a valid request. Invalid requests show a red gizmo, retain the last
valid image and disable acceptance; typed values are never silently clamped.
Camera navigation and pivot repositioning remain available.

There is one selection/neighborhood rule:

- Selected faces and edges move rigidly, including their boundaries/endpoints.
- A face whose complete non-seam boundary moves is carried rigidly too. A top rim
  and its enclosed cap therefore express the same movement in the tested examples.
- Shared edges are reconstructed once. An unselected straight edge connects its
  new endpoints; other partially moved curves blend endpoint displacement across
  their spline poles. Boundaries whose endpoints both move retain a rigid transform.
- Faces incident to moved vertices reconnect to those boundaries. Other faces and
  the outer boundary of the affected neighborhood stay fixed. There is no automatic
  feature classification, loop selection, remote propagation or sketch dependency.

Reconstruction is driven by boundary structure, not hole/boss/chamfer labels.
Coplanar boundaries produce a plane, retaining holes as trimming loops. Boundaries
that remain on their original cylindrical support retain that cylinder and its
trim loops; projected boundary parameters preserve the original periodic branches
and both seam occurrences. This allows a neck with a threaded lower boundary to
lengthen when its cap moves axially. Projection correspondence and resulting edge/
vertex tolerances must remain within 1e-6 mm. A periodic band with two closed
boundary edges otherwise uses a ruled connection. A nonplanar single loop uses a
fitted surface. This changes accepted BRep surfaces, not just the mesh.
The kernel checks fitting error against 1e-6 mm, sews within that tolerance and
requires one valid, positive, non-self-intersecting solid. Sewing history continues
face IDs; edge continuation requires length and bidirectional sampled-distance
agreement with the constructed boundary, with a bijection and unchanged topology.
These are bounded numerical checks, not certified global error/swept-path proofs.

Only positional boundary continuity is requested. Tangency, original interior
curvature and surface fairness are not additional acceptance constraints. An
unselected curved neighbor may change substantially when refitted. Those outcomes
are subjects for founder review, not reasons to add shape-specific eligibility rules.
Zero movement returns the current geometry. A selected already-warped face still
moves rigidly; reopening does not require the operation that originally produced it.

The existing owner retains temporary preview, invalid recovery, one-step Undo and
Save/Open. Known limits: nonplanar faces with multiple boundary loops outside the
cylindrical-support/periodic-band cases, topology changes, and some unsupported/degenerate boundaries
still reject. Through-hole wall tilt currently hits the nonplanar multi-loop
limit; the removed analytic retrimming path no longer handles it. This does not
imply universal arbitrary-BRep movement support.
Hole/pocket/boss translation on planar stock uses this same path and preserves
flat attachments and unchanged outer stock boundaries in the verified examples.

## Known captured limitations

The captured 12-face deletion still exceeds the native 10-second deadline;
responsive cancellation does not mean that geometry can be healed.
Adding 1 mm to the top of the helically cut cylinder in
`tests/agent-revolve.mjs` rejects with `BRep_API: command not done`, preserving
accepted geometry. Neither case has a geometry fix established by the earlier checks.

The captured notched cylinder now shells inward/outward, but subsequently offsetting
its filleted interior floor by +0.2 mm still clamps to zero: the expanded tangent-face
chain fails the current check against joining distinct boundary endpoints. This remains a face-offset
limitation, separate from the shell's solid/boundary and export validation.
