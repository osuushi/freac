# Document model and ownership

Read for work in this area, not on every resume. [Architecture index](../architecture.md).
Later founder decisions override earlier proposals.
Cubic editing/projection (2026-09-16) supersedes any earlier spline exclusion.

## One document and a small set of responsibilities

Use a shared, strict TypeScript sketch model. The backend owns the accepted
document, temporary solved candidate and snapshot Undo; the renderer receives a
read-only view. Native components calculate geometry without owning a document.
No Electron or Node types enter the sketch model or interaction modules.

| Responsibility | Owns | Does not own |
| --- | --- | --- |
| Document editing | Geometry, constraints, groups, edit acceptance, Undo/Redo | Pointer events, native handles, network protocol |
| Interaction | Selection, active plane/tool, drag intent, numeric field drafts | A second geometry database or separate mutation path per tool |
| Sketch geometry | Curve evaluation, intersections, snapping queries, derived regions | DOM, history, solid-tool behavior |
| Solver adapter | Candidate coordinates and constraint diagnosis from explicit inputs | Document identity, saving, UI state, Undo |
| Presentation | Outlines, fills, handles, dimension placement and hit candidates | Canonical dimensions or persistent geometry identity |
| Host | Files, app lifetime and native component calls if required | Sketch semantics |

These begin as modules, not six services or packages. Ordinary typed edit functions
are sufficient. Moving selected geometry and editing a dimension both use the
document's edit path; they do not require a generic command-bus framework.
The composition root only constructs and connects these responsibilities.

Electron and Three.js remain selected. Native component reuse starts from the
existing C++20 build; it does not make C++ the owner of application policy or settle
every future backend choice. Do not reopen the desktop-shell or frontend-framework
choice. The short solver/curve integration decision is described below.

## Entity panel organization

The document optionally stores `entityPresentation`: stable entity IDs with names
in panel order. Bodies, sketches and saved planes remain separate groups. Missing
entries use their existing generated labels and appear after saved entries.
Rename and insertion-before-ID reordering are direct document edits, saved with the archive and
included in snapshot Undo/Redo. Reordering never changes geometry array order or
selection. Double-click replaces the row label with a name field; Enter or blur
accepts and Escape cancels. Dragging a row previews an insertion marker within its
group and accepts one Undo step on release. Escape, lost capture and a drop outside
the group cancel. The panel scrolls near its edges during a drag. There is no row
menu or up/down control. Select + Enter enters a sketch (revealing it if hidden)
or a saved plane's workspace. Metadata
for removed IDs is ignored and pruned on the next organization edit. One-to-one
geometry continuations retain their names through their stable IDs.

## Sketch data model

| Data | Meaning and lifetime |
| --- | --- |
| Document | Units and a collection of sketches; exactly one accepted state in memory |
| Sketch | A plane frame, curves, constraints and optional editing groups; a continuing workspace |
| Plane frame | Origin plus orthonormal U/V axes; sketch coordinates are always local 2D coordinates |
| Curve | Stable document-local ID, typed geometric definition, construction flag |
| Constraint | Stable ID, kind, references to curves/features and optional dimensional value |
| Editing group | Member curve IDs and optional convenience metadata such as “intact rectangle” |
| Region | Derived closed loops of curve spans, including holes; recomputed from current geometry |
| Selection | Transient references to curve/features, groups or current regions; separate from document data |

V1 curve definitions cover a segment, circle, circular arc and ellipse/elliptical
arc. Store actual curve parameters, not their display polyline. A feature
reference names an entity and a meaningful part, such as endpoint, center or
axis endpoint. Do not use solver indexes or render-array positions as IDs.
Define each concrete payload alongside its first implementation; no schema generator.

A rectangle is four line segments with closed corners, parallel opposite sides
and perpendicular adjacent sides. An editing group exposes convenient center,
edge and corner handles. Width, height and angle are derived from that geometry;
there is no separate authoritative rectangle origin/width/height record. Its
shape constraints do not pin it to XY axes or a world origin. It can translate
and rotate unless the user adds constraints that prevent those movements.

Rectangle creation, individual line creation and a future polygon tool therefore
produce the same kind of editable curves. Trim can break a rectangle group while
leaving ordinary editable geometry; it does not require another document format.
Groups never override constraints or silently repair geometry into their old shape.

Drawing another crossing curve recomputes current regions without deleting or
rewriting the original curve definitions. A region can contain partial spans and
inner loops. A region handle is a current derived selection, not a persistent
object ID. After an edit that changes intersections, rebuild the fills and clear
affected region selection; retain surviving curve selection by ID. This needs no
public document revision number.

Closure feedback uses analytic segment/circle/arc arrangements. `curve-spans.ts`
splits curve parameter domains at actual intersections and coincident endpoints;
`regions.ts` walks directed spans into bounded faces. Tangent directions and
curvature order connections, and analytic signed area distinguishes bounded faces.
Display chords never decide whether curves connect. Model geometry and IDs remain
unchanged. Endpoint merging uses the existing 1e-7 mm coincidence tolerance.

`region-fill.ts` caches these boundaries with the displayed document and samples
them for triangulation at the current zoom. It draws translucent tint with stencil
union so nested/overlapping cells do not darken. A portion of a circle in a boundary
is a circular arc span with start/end angles. Arc entities provide a bounded
parameter domain and filtered intersections to the same walker. Selectable regions, hole containment and model operations remain S3.

Use one documented model-space tolerance policy for intersection, coincidence
and degeneracy. Screen-space hit/snap distances are a separate interaction policy.
Zoom must not change geometric validity. Choose numeric tolerances with the first
real curve adapter and test small/large examples; do not scatter magic epsilons
through tools or invent a precision framework before that need.
