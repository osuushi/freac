# Solver integration

Read for work in this area, not on every resume. [Architecture index](../architecture.md).
Later founder decisions override earlier proposals.
Cubic editing/projection (2026-09-16) supersedes any earlier spline exclusion.

## Solver and curve component decision

PlaneGCS is selected by the founder (2026-09-14), with LGPL accepted for the
open-source application. Reuse the pinned component knowledge; its fixture adapter
is not a production API. OCCT remains the existing curve/kernel candidate. Before the constrained-curve
increment, run one bounded integration check on an actual mixed sketch: lines,
circle and arc; translate underconstrained geometry; change a dimension; introduce
a conflict; confirm finite coordinates, residuals and useful diagnosis. Before
region work, check line/arc intersections, nested loops and a trim result with
the chosen curve adapter. Arc segments are required in v1; a rectangle-only
trial is insufficient. Do not investigate spline integration for this milestone.

The solver consumes a candidate's curves/constraints plus temporary drag targets
and returns solved values or diagnostics. Translate native indexes to entity IDs
inside the adapter. Its mutable numerical workspace, if required, is disposable
calculation state. It owns no accepted geometry, history or save format.

Default to reusing the existing native component build behind this narrow adapter
if it passes. Check applicable provenance/licensing before moving adapted source.
If reuse requires carrying FreeCAD/P1 document semantics into the editor, reject
that route and report the specific mismatch. Compare a replacement only against
that demonstrated need; no broad language/binding competition or new general
solver implementation. C++ remains an adapter candidate, not an unexamined mandate
for the application backend. Do not start a WASM port merely for symmetry.

Keep the shared frontend free of desktop-only calls. WebKit tests can use the
same local calculator via a small development host; this does not require remote
sessions, authentication or recovery protocols. Browser-only/offline iPad packaging
is not settled by these tests and is not an implicit promise of this design.

### Backend solver placement (accepted and integrated, 2026-09-14)

The founder approved desktop-backend solving. The target is local desktop use or
an iPad frontend on the same local network, not independent offline tablet modeling.
The first integration uses a TypeScript document owner and an owned C++ PlaneGCS
child process. This is a concrete choice for current sketch work, not a mandate
for all later geometry services.

The application backend owns the single accepted document,
edit candidate, validation and Undo history. PlaneGCS remains a calculator within
that backend. The frontend owns input intent, hover/selection, camera and a render
view of accepted/temporary geometry. Cheap snapping and guide feedback can use that
view, but final acceptance and coupled solving have one path on the backend.
Do not introduce a second browser solver or independently authoritative client model.

Use the same modeling operations through a local Electron boundary and, later, a
local-network browser connection. For a drag, one solve runs at a time and only the
latest pending pointer target is retained. Release waits for that target's valid
result; cancellation discards the candidate. Keep painting and local guides
responsive. No Internet-scale replication, document revisions, retry ledgers or
concurrent editing protocol follows from this placement. Backend placement does
not itself select the language for all backend application code or require a new
transport framework. Measure actual desktop and LAN feedback before considering
WASM duplication or moving solving to the frontend.

The current boundary is `ModelRequest` in `src/sketch/model-api.ts`. A sketch
preview carries an editing target; Accept has no replacement-document payload
and accepts only the backend's solved candidate. Numeric Edit solves and accepts
in one call. Undo/Redo, active-sketch Clear/Delete and New document execute in the
same owner. Electron uses a sandboxed preload with one IPC entry; browser tests
and development use a same-origin localhost Vite endpoint. Neither is a deployed
LAN hosting feature. Reloading a renderer retains the backend document and Undo;
New document explicitly starts fresh. App exit still loses unsaved work.

`solver-input.ts` maps stable segment IDs and radius locks to temporary numeric
indexes. Rectangle edits use five targets: one corner's X/Y, orientation, width
and height. Explicit length locks substitute for the corresponding size target.
A standalone locked segment uses one endpoint and orientation as temporary targets,
plus its persistent length. Previous extents seed the calculation on the intended
branch. These targets preserve existing anchoring and do not become hidden locks.

Circle/arc radius locks use PlaneGCS's scalar radius equation, seeded from the
previous radius. Circles retain their target center; arcs are reconstructed with
fixed endpoints and their existing side/minor-major branch. Unlocked curves retain
the direct edit path. This is not coupled arc endpoint/tangency solving.

C1 checks that ordinary drag targets preserve every numeric lock; a conflicting
drag rejects with an explanation and no document/Undo change. Explicitly editing
a locked field updates its geometry and lock value together, including held-drag
numeric input. A rigid move/rotation preserving locked values remains available.
C2–C4 add linked/underconstrained dragging. Linked arcs now allow temporary
radius-changing endpoint targets for native projection; accepted geometry must
still satisfy every explicit lock. Unlinked C1 paths retain their rejection policy.

C2 adds standalone line horizontal/vertical, parallel and equal-length records.
The local action seeds the subject with the requested orientation or length;
PlaneGCS enforces the actual relationship. The second selected reference is
constant only for creation. During later edits, unchanged endpoints of the edited
edge remain temporary anchors, while other related edges are solver unknowns.
Pointer targets use PlaneGCS's negative-tag lower-priority system. Explicit numeric
edits and rigid moves must still attain their requested geometry or reject; they
must not silently become nearest-target deformations. Unrelated components stay
unchanged. The final document validates every persistent relationship, including
ones involving only constant points that need no solver equation in that call.

C4 concentricity reuses ordinary center-to-center coincidence. The ordered pair
Concentric action translates the first selected circular curve to the second's
center without changing their radii or arc sweeps. The same relationship created
through point Fuse is displayed as Concentric. Later center movement is shared;
a fixed-endpoint arc radius edit translates center-linked peers while preserving
their own radii/sweeps. There is no separate concentric model or solver equation.

The first C4 tangent increment covers one standalone line and one circle/arc.
An ordinary tangent record keeps ordered curve IDs and the signed side of the
circular center relative to the oriented line. Initial application translates the
first selection, preserving both shapes and the second reference. It chooses the
nearest side whose contact lies on both finite edges; if neither side is valid,
the operation rejects. Later edits retain that side and validate finite contact.
PlaneGCS enforces signed center-to-line distance equal to radius. Circle radii stay
at their edited values; a changed circular partner seeds an unchanged tangent line
by translation to avoid arbitrary tilt in an underconstrained solve. This seed
adds no persistent or temporary locks. Existing relationships remain authoritative.
Inspect/delete/Undo uses the common constraint display. Circle/arc pairs now use the same Tangent action with an explicit external or
internal branch. Internal branches retain which curve contains the other; a radius
edit that would reverse containment rejects. Initial placement translates only the
first selection to the nearest valid contact while preserving radii and arc sweeps.
The search checks the current center direction and arc-domain boundaries, so it
can find finite contact even when the original center direction misses an arc.
Subsequent circular edits seed an unchanged peer by translation; native solving
still enforces all relationships, with independent finite-contact/branch checks.
At meeting endpoints, initial Tangent instead rotates the first selection about
the junction, preserving its length/radius/sweep and the second reference. The
tangent record retains endpoint roles, but does not implicitly Fuse them. Explicit
coincidence supplies the shared position; touching unfused endpoints are temporary
anchors for the calculation. If unfused endpoints separate, ordinary supporting
curve tangency applies again. Native perpendicular/parallel radius-normal equations
avoid the redundant support-distance equation at a junction; final validation still
requires finite contact and the stored branch. A later radius edit seeds rotation
of the unchanged peer about the junction, without adding locks.

Point drags explicitly identify their intent in preview requests, allowing
constraint projection even when a target accidentally preserves a curve's length.
Numeric edits and rigid transforms still require the requested geometry.

Exact edits submit unchanged anchors of the edited curves as temporary coordinate
targets too, and verify those anchors before acceptance. Treating them as constants
can make valid persistent relationships appear redundant (for example, the first
fillet when rounding the other corner of two joined arcs). Point projection and
ordered pair application retain their fixed anchors/reference geometry. Persistent
constraints remain in the driving system; an unattainable exact target still rejects.

The host checks solver status, diagnosis and all independent equation residuals
(1e-7 mm or normalized/angular residual). Contradictions and redundant driving
constraints reject the candidate. Unconstrained line edits use existing finite/
nondegenerate validation. Invalid final targets never fall back to accepting an
older preview. `GestureSolve` retains at most one pending target, and gesture
cancellation has no later acceptance path. Busy edits disable conflicting controls;
after 150 ms the status shows calculation activity. A ten-second calculator timeout
fails the edit and stops the child; a later explicit edit may start a fresh child.
