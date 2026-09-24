# Direct body tools

Status: interaction direction approved with founder corrections, 2026-09-15. The founder requested Move,
Duplicate, standalone Booleans, edge fillets, face-selection boundaries and Offset.
These extend current materialized bodies; they do not reintroduce feature history.
Implementation follows one usable tool at a time. This document defines agreed
direction. Move/Duplicate and Booleans are accepted. Edge selection
and face boundaries are accepted. Shared-radius fillets and symmetric chamfers are implemented;
Offset and its contact/chain follow-ups are accepted. Current user requests
determine further work; these earlier acceptances do not imply universal coverage.

## Selection and presentation

Keep whole bodies, faces and edges as distinct ordered selection targets. A face
selection must not silently mean its whole body for Move or Duplicate. Body rows
in Entities already select bodies. Add a compact Select body action for a selected
face/edge, promoting its owner explicitly; preserve planar-face double-click for
sketch entry. Shift adds and Cmd/Ctrl toggles. Hover uses the same hit as selection.

Add visible, depth-aware edge picking with a small screen-space tolerance. Only
pick real topological edges, not tessellation edges. Shared boundaries resolve to
one edge ID per body. Hidden geometry is not pickable through a body. Where a
sketch and a body edge overlap, expose the alternative explicitly rather than
changing the meaning of the same visible target unpredictably.

Only eligible actions appear, as small icons with tooltips. Quantities appear
beside the manipulated handle. No new permanent row of tool names or numeric panel.
The existing extrusion arrow remains a separate operation on profiles/planar faces.

## Delivery and interaction proposals

### 1. Move and Duplicate — first usable checkpoint

Select one or more whole bodies, then M or the Move icon. Show world X/Y/Z arrows
and rotation rings at the combined world-aligned bounding-box center. Drag an arrow along its
projected axis or a ring around its axis. Click a handle to type its signed distance
or angle. Translate/rotate all selected bodies rigidly about the same pivot.
The default anchor follows the selection bounds through edits and Undo/Redo.
An explicitly repositioned anchor stays custom until the selection changes.
The center anchor drags in the view plane at its existing depth without moving
geometry or adding Undo entries; Escape or focus loss cancels an unfinished drag.
Grid snapping quantizes that view-plane displacement. Clicking the anchor exposes
precise axis repositioning instead. Arrow handles have no coordinate letters; axis
names remain in tooltips. Spread ring handles away from the anchor and other
handles, and keep the anchor hit area above crossing rings. Arrow directions and
geometry movement must agree in rotated views; end-on controls remain operable.

Translation snaps displacement to the grid, preserving existing alignment.
Visible vertex/edge acquisition can override grid displacement; Option bypasses
geometry acquisition. No deformation, scaling, assemblies or persistent attachment.

A valid drag release or numeric Enter accepts one transform in one Undo step;
the gizmo remains for the next adjustment. Escape during an edit restores its
starting placement; Escape while idle exits Move. Camera navigation works between
adjustments, including when the pointer is over a floating widget or numeric
field: scroll pans, Command-drag orbits, pinch zooms, and secondary/middle drag pans.
Navigation remains blocked during a geometry or anchor drag. Leaving the application does not accept an unfinished edit.

Duplicate enters the same Move interaction with temporary independent copies,
originals unchanged. First valid move/rotation accepts copy plus placement in one
Undo step. Enter without moving accepts copies in place; Escape before acceptance
creates nothing. Select the accepted copies afterward. No persistent Copy mode or
linked instances. Every copy receives fresh body, face and edge IDs.

Acceptance: create two unequal bodies with a hole, select both, move and rotate
by drag and number around a relocated pivot, duplicate and place the copies,
cancel another duplication, Undo/Redo, save/reopen, and sketch on transformed faces.
Check positions/orientation, volume and identities, not only the rendered result.
The original sketches remain independent. First running slice should fit one hour;
if complete acceptance exceeds two hours, report the concrete obstacle before
expanding scope. Review this usable pair before implementing the remaining tools.

### 2. Standalone Booleans

Whole-body selection offers Union, Subtract and Intersect. No extrusion is needed.
Union combines selected operands; Intersect retains their common solid volume.
Both are commutative: their UI has no target/tool roles or direction selector.
Subtract proposes the first-selected body as target and the rest as cutting tools,
with blue target and amber cutter outlines and a local button cycling the target
through selected bodies.
Selection order is a starting suggestion, not an invisible permanent dependency.

Preview before acceptance. Enter or an explicit next selection accepts; Escape
restores inputs. Keep originals is an explicit local toggle, off by default; for
Subtract it preserves cutting tools, while for Union/Intersect it preserves all
inputs. Unselected bodies remain untouched. Accept all output solids, including
splits. A valid empty result is shown as such and can be accepted deliberately.
Do not silently produce empty geometry after a kernel failure. One Undo restores
all consumed operands and removes the result together.

Acceptance: disjoint/touching/overlapping operands, cut into multiple solids,
multiple tools, empty intersection, keep originals, target swap, Undo and reopen.

### 3. Edge selection and Select boundary edges

Sketch region-walking cuts do not become body edges: complete circular boundaries
lower to closed kernel edges, and contiguous spans of the same circular curve
rejoin before extrusion. Periodic seams stay in exact stored topology but are
excluded from ordinary outlines, selection and geometry snaps. This affects new
extrusions; it does not rebuild existing materialized bodies.


Hover highlights a visible edge; click selects it separately from faces/bodies.
Selected and hovered edges use bold 4-pixel blue/amber overlays drawn through
bodies. This display feedback does not change occlusion-aware picking.
Shift adds, Cmd/Ctrl toggles. Occluded body edges cannot be selected through faces.
Face boundary data comes from exact BRep wire occurrences mapped to stable edge
IDs; a seam can occur twice on one face. Kernel indexes do not become document
identities. Older files regenerate these references when opened.

With a nonempty selection consisting only of faces, expose Select boundary edges.
Replace faces with the topological perimeter of their combined selection: include
outer and hole loops; exclude edges internal to two selected faces and periodic
surface seams. Different bodies are processed independently. Selecting every face
of a closed body can legitimately yield no boundary. Selection changes are not
model edits and do not create Undo steps.

This is deliberately different from selecting every edge incident to any face.
Acceptance includes an annular
face, adjacent faces, disjoint faces, curved-face seams and a complete closed shell.

### 4. Edge fillet

Pure edge selection offers a fillet icon and local radius handle. Apply one shared
radius to all selected edges; do not omit an edge that fails. On tool entry,
expand the selection to the tangent contours required by OCCT and highlight the
complete source chain, including during the preview. Preserve initial selection
order; append required edges only, without crossing sharp corners or adding
unrelated chains. A local rounded-corner icon anchors near the first selected edge:
drag upward to increase radius or click to type millimeters. Keep the result temporary through release,
so radius can be adjusted before Enter/next selection accepts; Escape cancels.

Founder correction, 2026-09-15: constrain both dragging and numeric input to
legal sizes. This supersedes the original invalid-number/no-clamping behavior.
A failed size is bracketed against a kernel-verified feasible size; the displayed
number and candidate use that verified value. Repeated overshoot reuses the current
document/selection's verified limit. Drag reversal at the limit responds immediately
without dead cursor travel. Zero restores the starting body and accepts no edit;
negative numbers settle at zero. No universal half-edge-length cap is imposed.
The search gives a conservative feasible boundary, not proof of a global maximum.
Malformed input or selections with no feasible operation still report an error.

Keep exact edge IDs and explicit result correspondence. Do not approximate fillets
with mesh edits. Founder correction, 2026-09-15: required tangent-chain expansion
is automatic for both Fillet and Chamfer. Discover contours before changing geometry,
so opening a tool does not create a document edit or Undo step. Cancellation retains
the expanded edge selection. Camera gestures
over the widget remain available between drags; application focus loss cancels.

Acceptance: convex and concave edges, multiple meeting edges, circular rims, typed
and dragged overshoot, immediate reversal, zero, Undo, reopen and sketching on
surviving planar faces. Variable-radius fillets remain separate later work.

### 5. Edge chamfer

Pure edge selection shows a separate chamfer button beside Fillet. Use the same
local drag/type/preview/accept/cancel interaction and verified size limits.
One shared distance is the equal setback on both adjacent faces; it is not the
diagonal bevel width. Exact OCCT chamfers apply atomically across selected bodies.
Straight corners create planar bevels; circular rims can create conical faces.
Asymmetric distances and angle-based chamfers are outside this increment.

### 6. Face offset

Offset selected body faces, not generate a whole-body parallel shell. Planar faces move along their oriented normals, extending and
retrimming neighbors. Cylindrical faces support hole/boss radius or diameter edits.
Planes and cylinders are initial acceptance cases, not the face model’s domain.
Spheres, cones, tori, blends and general parametric surfaces must remain representable
and selectable. Fillets already motivate curved support; revolve/loft will add more.
A curved face offsets along its normal field, not a single translation vector.
Expose surface-specific measurements when meaningful without narrowing the generic
face identity or operation interface to those measurements.
This edits accepted geometry and is distinct from extruding a face footprint.

Use a local normal/radial handle and signed quantity. For a hole, positive material
outward offset reduces its radius; the radius/diameter field avoids that sign
ambiguity. Several selected faces share offset distance but use their own normal fields.
Keep preview temporary until Enter/next selection accepts, because offset can
change topology. Reject unsupported surfaces and invalid/self-intersecting results
without altering the accepted body. State the supported surface set explicitly.

Acceptance must include the founder's 3 mm to 5 mm hole correction, a planar face
beside a hole, multiple faces, collapse/invalid edits, Undo and reopen. Whole-body
offset and shell thickness need separate semantics. Freeform-face offset belongs
to this tool’s eventual scope; each supported surface class needs kernel validation.

## Implementation ownership and current gaps

The TypeScript document owner remains authoritative. Add concrete operation
requests to its existing calculate/accept path; C++/OCCT computes exact candidate
BReps, presentation and correspondence. Do not add another document, persistent
operation history, revision protocol or generic tool framework.

Current code supports body/face/edge selection, exact face-edge incidence,
materialized BReps, extrusion, standalone Booleans, shared-radius native edge
fillets and symmetric chamfers, planar/cylindrical/conical face offsets, existing constant-radius fillet editing, temporary candidates,
snapshot Undo and exact body transforms/copies.
Face offset and existing fillet editing are available for founder review. Exact topology is authoritative;
presentation excludes periodic seams without deleting their stored identities.
Transforms preserve all existing body/face/edge identities through explicit
correspondence; duplication allocates fresh IDs. Topology-changing operations
preserve only unambiguous continuations and allocate new IDs for splits/merges.
Do not identify transformed faces by matching their old world-space signatures.
Derive any missing surface facts from the kernel for the tool that needs them.

The initial offset implementation uses OCCT's per-face offset/retrimming operation.
Selected planes, cylinders and cones are supported, with spherical/toroidal
patches supported within tangent offset chains. Recognized cylindrical,
toroidal and spherical fillet faces instead offer radius editing. Other surface
classes remain selectable but do not yet offer Offset. A single cylinder defaults to a
diameter field, with a small toggle to signed offset; multiple faces share signed
offset along each face's own material-outward normal. The local arrow uses that
normal, with up/down dragging when viewed end-on. Zero exits without an edit.
Opening the tool does not change geometry; release retains the temporary candidate.

Runtime checks verify a planar face beside a hole, Ø3 → Ø5 hole editing, a cylindrical
boss, multiple faces/bodies and repeated edits. Native cylinder measurements include
surface handedness as well as face orientation; face orientation alone gives the
wrong radius-change sign for some inward walls. Reject cylinder radius collapse
before calling the kernel. Candidate validity and continuing unselected supports
are checked; a fillet cylinder alone must not drag unselected tangent planes.
Normal offset now automatically expands selection across shared tangent boundaries,
including the required planes and curved patches. Sharp boundaries and disconnected
bodies stop expansion. The entire chain is highlighted on tool entry, before any
geometry changes; direct dragging continues and cancellation keeps that selection.
The native operation derives the same closure for callable edits. Collapse guards
cover cylindrical, spherical and toroidal radii. This is distinct from the smaller
fillet-radius group: a fillet selected on its own uses the path below, with fixed walls.
This increment requires one valid continuing solid per affected body; offsets that
collapse or split it, unsupported surfaces, and failed retrimming remain explicit
errors without changing accepted work. General curved-face offset remains future
work, not a claim derived from the existing fillet/extrusion tools.

Existing constant-radius fillets are recognized from current analytic surfaces and
shared tangent boundaries. Selecting one exposes a radius field; connected
same-radius blend patches are visibly included when opening the tool. The kernel
removes those patches from the current BRep, recovers support intersections and
rebuilds the fillet at the requested radius. This uses no saved feature history.
Continuing unselected support surfaces must remain fixed. Failed removal,
reconstruction or invalid radii leave accepted geometry untouched. Convex,
concave, circular-rim and spherical-corner cases are covered; arbitrary variable
radius/freeform blends are not claimed. Unambiguous face continuations retain IDs;
a regenerated corner without reliable correspondence receives a fresh ID.

Drag directions come from oriented surfaces, including their coordinate-system
handedness. Signed normal offset and fillet radius are different measurements:
outward dragging adds material, which reduces a convex fillet's radius. Typing
its radius edits that radius directly. Planar chamfer positive/negative offset
semantics are unchanged; the correction aligns the arrow and drag with them.

Planar offsets now absorb same-facing parallel neighbors when the translated
finite faces meet. Before contact the neighbor stays fixed; at contact the step
vanishes; beyond contact both supports move to the same plane. Crossing an
unrelated infinite support plane alone is insufficient. This repeats through
successive steps and is independent of world orientation. Coplanar faces and
collinear edges are unified after offset reconstruction, using operation
correspondence; merged entities receive fresh IDs. The actual merged candidate
face remains highlighted. Reversing the gesture recomputes from the accepted body,
so consumed steps reappear until the edit is accepted.

Normal-offset reconstruction failures and radius-collapse guards now constrain
requests to verified geometry between the request and the last valid candidate
(or zero). The field shows the achieved distance and the preview remains valid.
Malformed requests and transport errors are still errors, not geometric limits.
This is a bounded local search, not proof of a global maximum. One solid per body
is still required; splitting/deleting entire bodies and general curved-face
consumption are not implemented by this planar-contact rule. Cancel restores the
source selection/body; acceptance is one Undo. No validity check is disabled.

Use pointer/keyboard acceptance with actual native results in headless Chromium,
WebKit and hidden Electron. Reuse existing solid-loop regression fixtures. Commit
coherent usable increments. Physical iPad and Linux/Windows builds remain separate
platform evidence, not implied by these desktop checks.


## Deferred investigation: mesh-backed faces and bodies

Founder question, 2026-09-15: could explicit conversion to mesh-backed geometry
provide a fallback for failed BRep operations or excessive model complexity?
This is a feasibility direction, not approval to add another kernel now.

A mesh-backed face can be one selectable/labeled patch comprising many triangles.
That is distinct from a display tessellation of an authoritative parametric face.
A future mixed body would need consistent shared boundaries and valid solid
classification between mesh patches and parametric faces; storing both kinds
does not supply the operations across their interfaces.

There is commercial prior art: Siemens describes mixed facet/classic BRep models
in [Parasolid Convergent Modeling](https://news.siemens.com/en-us/parasolid-convergent-modeling-mixed-models/).
This establishes feasibility elsewhere, not support in Freac's OCCT path.

A more bounded possible first fallback is explicit conversion of selected whole
bodies at a chosen approximation tolerance, followed by a dedicated mesh Boolean.
[Manifold](https://github.com/elalish/manifold) documents manifold Boolean output
for suitable manifold inputs. This is not a guarantee that tessellating an invalid
BRep yields valid input, nor that approximate geometry preserves narrow features.

Freac recommendation for later review: never silently replace exact accepted
geometry with a mesh. Preview conversion, expose tolerance and changed editing
capabilities, preserve originals on request and Undo, and carry patch identity
where correspondence is known. Do not promise exact conversion back to original
surfaces or restored fillet/radius editing. Decimation can reduce cost but trades
geometric fidelity; tessellation alone may increase complexity.

No mixed-surface representation or mesh dependency is introduced in the current
Move/Duplicate work. Keep authoritative body geometry distinct from render data,
and avoid asserting that every future face has a parametric surface. A concrete
fallback example should determine any later representation and kernel choice.
