# Sketch transforms

Read for work in this area, not on every resume. [Architecture index](../architecture.md).
Later founder decisions override earlier proposals.
Cubic editing/projection (2026-09-16) supersedes any earlier spline exclusion.

### Move, resize and rotate

Moving a selection applies one translation to every selected entity. Shared
endpoints move once. Geometry linked to unselected geometry by constraints follows
those constraints; preview shows all affected geometry. A fixed constraint either
limits the permitted movement or rejects an impossible edit, with visible feedback.
Do not silently break constraints, move only part of a requested rigid selection,
or remove a dimension to make the gesture succeed.

Other curves must be editable on delivery too: a line exposes both endpoints;
a circle exposes center and radius; an arc exposes its center, extent and radius;
an ellipse exposes center, axes and angle. Moving a connected endpoint affects its attached
geometry under the same constraints. Each tool brief specifies its creation
variant and these subsequent edits together. A curve that can only be drawn does
not complete its tool.

Rectangle handles have the same semantics after creation and after reselection:

| Handle/action | Intended result |
| --- | --- |
| Center/interior drag | Translate the whole rectangle without changing size |
| Left edge | Move that edge along its normal; hold the right edge fixed |
| Right edge | Move that edge along its normal; hold the left edge fixed |
| Top edge | Move that edge along its normal; hold the bottom edge fixed |
| Bottom edge | Move that edge along its normal; hold the top edge fixed |
| Any corner | Move that corner; hold the opposite corner fixed and edit both extents |
| Width/height field | Edit the corresponding extent using the active handle's anchor; default to the rectangle center when no handle is active |
| Rotation handle/angle | Rotate around the shown pivot, initially the selection center; allow repositioning the pivot |

“Left/top” describes the rectangle's current local frame. A rotated rectangle and
an XZ/YZ sketch behave identically. Edge motion ignores tangential pointer travel.
Crossing the anchor can flip an unconstrained rectangle; a degenerate zero-width
or zero-height candidate cannot commit. Do not implement all resizing by changing
positive width/height from a fixed lower-left origin.

These targets are temporary edit intentions. Persistent user locks remain
authoritative. A width lock prevents an edge resize until unlocked or edited;
it does not prevent translation. The UI shows why a handle is constrained.

Copy creates fresh entity/constraint IDs and copies constraints internal to the
selection. Links to unselected geometry are not duplicated implicitly. Mirror,
uniform scale and linear/circular copies use the same selection/edit lifecycle;
their pivot/axis/distance/count controls are local. An impossible transform must
not silently change locked dimensions. Exact gestures are specified per increment.

Rotation handles turn freely by default. Holding Shift snaps to 5° increments;
Shift+Option/Alt snaps to 0.5°. Held previews respond to modifier changes without
pointer movement. Sketch rotation snaps the displayed orientation; world rotation
handles snap their gesture angle. Numeric entry remains exact, and Option retains
its Move duplication behavior.

### Option-Move duplication (founder-directed, 2026-09-21)

Holding Option/Alt during Move leaves the original geometry and transforms an
independent copy. This covers selected sketch geometry (including a subset of a
sketch), whole-sketch placement and complete bodies, including the Move widget's
rotation controls. Partial solid faces/edges retain ordinary Move behavior:
Option has no duplication effect there. Detached topology and reattachment are deferred.

The held preview responds immediately to pressing/releasing Option. Pointer release
accepts one Undo step; Escape cancels without creating a copy. Option-click a Move
handle to type a numeric copy transform; that click captures the copying choice.
The resulting copies become selected, retain selection order, and remain ordinary
editable geometry. Pivot-only movement never duplicates geometry. Drawing and resize
symmetry retain their existing modifier behavior.

Sketch copies get fresh curve/constraint/group IDs, retain only internal relationships
and complete rectangle groups, and never acquire implicit links to their originals.
Whole-sketch copies also get a fresh sketch ID. The existing DocumentOwner edit path
owns acceptance and history; gesture copy IDs and placement previews are temporary.
Whole-body copies use the existing exact-kernel transform with fresh topology IDs.

### Mirror (founder-approved interaction, 2026-09-20)

Select whole sketch curves or complete bodies, then **Mirror**. Sketch mode accepts
an existing straight line or local X/Y axis; modeling accepts a planar face or
XY/XZ/YZ world plane. Pick these directly in the viewport; there are no axis/plane
buttons in the local controls. Hover shows axes as thick blue lines, straight edges
along their actual length and planar faces with a blue fill; world-plane patches
retain their hover tint. This decoration clears on leaving a candidate or the tool
and never changes source selection or accepted geometry. Straight curves take
precedence over axes where they overlap. At the origin, move along an axis to
disambiguate the crossing. Body world planes use the viewport patches.
Partial faces and points are not mirror sources. The reference
is highlighted; its signed offset and **Keep original** checkbox are local controls.
Keep original defaults on. Enter/check accepts the temporary result in one Undo
step; Escape/cross cancels. A valid result also completes when leaving through an
operation-aware selection action. Failed/invalid inputs cannot accept. Navigation
remains available during calculation; conflicting edits are excluded.

Copies receive fresh document-local curve, constraint, group and topology IDs;
replacement preserves source identities and body order. The result is ordinary
editable geometry without a live link to either source or reference. Copy selection
retains source selection order. Sketch copies retain only internal constraints and
complete rectangle groups; external links are not cloned. Reflected arcs reverse
bulge, cubic controls reflect with endpoints, signed corner angles and tangent sides
reverse. Replacement retains external constraints. Every resulting sketch must
satisfy its constraints exactly: incompatible axis locks or external links reject
without distortion or silent constraint removal. The user can change the reference,
choose copying, or explicitly edit those constraints.

DocumentOwner owns the preview, acceptance and history. Sketch reflection validates
an exact coordinate transform without asking the solver to deform it; solid
reflection uses the existing exact-kernel transform and topology correspondence.
Mirrored bodies remain separate even when they touch or overlap; Boolean is an
explicit subsequent operation. No persistent symmetry constraint is introduced.

### Move widget (founder-directed, 2026-09-21)

Move follows the founder-approved [orientable widget design language](../design/orientable-widgets.md):
white capsule forms, a single black silhouette, a sphere anchor and a smaller curved
rotation glyph. Its assembly has fixed positions and orientations in the sketch or
world frame, with constant nominal CSS-pixel scale through zoom. Camera-facing heads,
collision-driven sliding and alternate-diagonal placement are superseded.

Sketch Move has two positive local-axis arrows and a rotation marker at the positive
45-degree position. Modeling Move has three world-axis arrows and one rotation marker
in each coordinate plane. Within 12° of either direction of a canonical axis, modeling
shows the other two translation axes and rotation about the end-on axis. Planar rotation
markers hide within 12° of edge-on, including their hit targets. The dimensions and
thresholds are reference defaults that may be tuned through visual review.
Whole-sketch **Move sketch** uses this same assembly to transform the sketch plane
without changing its local curves; a relocated anchor supplies its rotation center.
Existing edge movement remains translation-only, including its boundary-normal control.

The anchor is renderer UI state, independent of accepted geometry and Undo. In sketch
mode it drags in the workspace plane. In aligned modeling views it drags in the visible
canonical plane; otherwise it uses the plane through the anchor perpendicular to the
upright canonical axis selected by camera leveling. Thus Y-up uses XZ. During dragging,
a visible point of interest within 10 CSS pixels takes precedence over free placement:
origin, topology vertices, recognized circular/rectangular planar face centers, and
sketch points. Body triangles provide occlusion only, never extra snap vertices.
Sketch snapping stays in its workspace plane. Command bypasses point snapping and does
not orbit when the gesture starts on the anchor. Free anchor placement does not grid-snap.
Escape, pointer cancellation or focus loss restores the gesture's original anchor.
Geometry movement/rotation retains its existing solver/kernel, preview and Undo behavior.

### Uniform Scale (founder-approved contract, 2026-09-21)

Scale accepts selected whole sketch curves, whole sketches in modeling, complete
bodies, selected faces or selected edges. Resolve supported combinations explicitly;
never silently omit selected targets. Scaling uses one positive uniform factor
about a movable sphere pivot, with exact numeric entry and a local drag control.
The pivot belongs to UI state. It follows the established Move placement/snapping
conventions and does not add history or become persistent geometry.

The initial factor is one. Release retains the temporary preview; Enter/check
accepts one Undo step and Escape/cross cancels. Identity and rejected edits preserve
Redo. Nonpositive or nonfinite factors cannot accept. Existing locks and external
sketch relationships are retained: an incompatible exact scale rejects rather
than asking the solver to deform the result or removing constraints.

For a whole sketch, uniformly transform its frame origin about the world pivot,
keep its unit axes unchanged, and scale its local coordinates/radii. This scales
the actual world geometry while keeping the plane frame orthonormal. Construction
planes from which a sketch was created remain independent.

Whole bodies transform exactly. Selected faces/edges scale and reconnect their
neighbors through the existing boundary editing path, with validity, tolerance
and topology correspondence checks. Scaling a cap or complete rim about its center
can taper the adjoining walls; this does not promise every possible Draft operation.
Unsupported reconnections remain recoverable errors. Directional/nonuniform scale
is deferred: sketch circles/arcs would require an additional representation or
approved approximation policy.
