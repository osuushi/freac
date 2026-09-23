# Curve modification and regions

Read for work in this area, not on every resume. [Architecture index](../architecture.md).
Later founder decisions override earlier proposals.
Cubic editing/projection (2026-09-16) supersedes any earlier spline exclusion.

### Curve modification and regions

Trim highlights the exact span to remove between intersections and commits its
geometry/constraint changes together. Repeated T retains the tool. Outside a
plane, T asks for an unambiguous spatial target; it never chooses XY arbitrarily.
Split, extend, offset, sketch fillet and chamfer follow the same local lifecycle.

T1 trims ordinary lines, circles and arcs at analytic contacts. Its cuts exclude
the region walker's artificial circle seams; a circle with fewer than two distinct
contacts is removed whole. The first surviving piece retains the curve ID, and
additional pieces get document-local IDs. Endpoint links follow the piece that
retains that endpoint; radius and center relationships can follow both arc remnants.
Direction constraints stay on one line remnant with a parallel relationship to
the other, avoiding redundant copies of every direction equation. Tangency follows
only a remnant with finite contact. Whole-edge length relationships that no longer
hold are disclosed for removal. A new cutting endpoint automatically Fuses when
exactly one other surviving curve endpoint meets it. This runs after overlapping
span removal and belongs to the same Undo step. Untouched endpoints, ambiguous
junctions and cuts meeting an edge interior do not acquire new links.

Trimming a rectangle removes its convenience group and preserves the meaningful
ordinary constraints. If an entire side disappears, its perpendicular relationship
can use the surviving opposite side, retaining the remaining right angles. The
trim click accepts the validated rewrite automatically. Removed relationships
appear in a brief bottom notice; Undo restores the original geometry and constraints.
Hover chooses the shortest span among equally close hit curves, without a chooser.
A click clears the highlighted span and every coincident portion in the active
sketch, splitting longer overlaps while preserving their outside remnants. Mere
crossings and curves in other sketches are untouched. The highlight clears after
acceptance; the entire rewrite is one Undo step. Creation of new remnant geometry
is a rewrite, not a standalone
pair action with a privileged reference. Native validation and snapshot Undo remain
the acceptance boundary.

Keep constraints referring to surviving geometry where their meaning survives.
Remove constraints attached only to deleted geometry. If a retained constraint
cannot be meaningfully mapped, explain the affected constraint before accepting
its removal; do not silently break it or invent a correspondence. Define these
rules for each curve rewrite in its short tool brief, with Undo and rejection cases.

Regions must support connected linework, line/arc mixtures, nested loops/holes,
disjoint cells, crossings and tangent contacts. Display tessellation is never the
canonical closed boundary. Coincident duplicates and tiny trim remnants need
explicit tests; they must not poison unrelated valid cells. Unsupported numerical
cases get a local diagnostic, not a silently unselectable profile.

Sketch-to-sketch projection initially makes an explicit independent copy of the
projected curves, using source/target frames. A dynamic linked projection is a
separate product decision; do not build a dependency engine to deliver copying.

Projection implementation (2026-09-16): source selections retain document-local
face/edge/curve references. The backend resolves face sets against the accepted
document using `model/face-boundary.ts`; shared internal edges and periodic seams
are omitted, hole loops retained. Explicitly selected edges remain sources even
when internal to a face set. A whole closed shell has no boundary and is rejected;
this is boundary projection, not silhouette extraction. Target frames come from
the active sketch, XY/XZ/YZ or a planar body face. Reuse a coplanar sketch or create
one on acceptance. `backend/projection.ts` and the native kernel produce the usual
temporary candidate; acceptance is one Undo, without a persistent source link.
Analytic primitives survive where natural; other curves become editable cubic
pieces with a 0.001 mm approximation budget. Point-only projections are rejected.

Corner fillet hints retain their world-space radius while the same corner is
selected, so zooming in enlarges a crowded hint. Initial sizing provides clearance
from the corner and a visible arc radius, bounded by the available supports.
Dragging targets the closest point on the finite rounding arc, including its
endpoints, rather than projecting the cursor onto the corner bisector. Curved and
consumed supports use a sampled radius search with local refinement; grid snapping
compares nearby permitted radii by arc distance. Creation and existing-fillet radius
drags share this calculation. Explicit numeric radii still validate exactly, and
acceptance remains one ordinary sketch edit.

Clicking or dragging the sketch fillet guide accepts on pointer release and selects
the new arc for ordinary editing. Clicking away or pressing Escape afterward leaves
the accepted arc intact; Undo restores the corner. Held gestures remain cancellable.
The explicit Fillet sketch corner menu command retains numeric entry before acceptance.

Sketch offset accepts a single analytic edge or one closed loop, including mixed
cubic/line/arc loops copied from solid sections. Closed loops containing cubics
use native planar intersection-join offsets; positive distances expand the loop.
The result returns independent ordinary curves through the existing 0.001 mm
bounded cubic conversion and shared-vertex endpoint correction. Source geometry
and constraints remain unchanged; new joined endpoints receive coincidence links.
Preview remains temporary, Enter/drag release accepts one Undo step, and Escape
cancels. Disconnected, crossing, collapsed or split results reject atomically.
Open cubic offsets remain unavailable and the tool explains the closed-loop
requirement. No persistent offset dependency or general NURBS editing is introduced.
