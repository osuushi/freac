# Point relationships and drawing attachments

Read for work in this area, not on every resume. [Architecture index](../architecture.md).
Later founder decisions override earlier proposals.
Cubic editing/projection (2026-09-16) supersedes any earlier spline exclusion.

### Explicit point links (C3 in progress)

Fuse/Unfuse is integrated for selected standalone line/arc endpoints and circle/arc
centers in the contextual point chooser. Fuse joins selected coincident points using a minimal set of
ordinary coincidence constraints; IDs and coordinates do not merge. Repeating
Fuse is a no-op. Unfuse detaches selected points while preserving connectivity
among the unselected points of the original junction. A removed spanning-tree hub
must not accidentally disconnect the remaining points. Each edit is one Undo step.

Point selection and co-dragging remain separate from persistent links. Linked
endpoint edits propagate through the document's coincidence graph and pass through
PlaneGCS acceptance. A stable point reference identifies a curve and its endpoint
or center. Circle centers enter the same temporary native point array as line
endpoints; circle radii stay independent of center coincidence. Redundant
coincidence cycles are rejected. Linked arcs expand temporarily to endpoints, center
and radius. PlaneGCS point-on-circle equations keep both endpoints on that circle;
the result returns to endpoints and signed bulge, preserving the sweep direction.
A radius-locked endpoint drag targets the endpoint while the derived center follows.
When both endpoints and radius are fixed, the chosen branch determines the center,
including the singular semicircle; those parameters remain calculator constants.
Point links survive line-to-arc bowing and arc radius edits. Flattening an arc with
a linked center requires detachment.

For separated points, click the subject point, then Shift-click its reference.
The contextual point widget preserves that selection order and offers Coincident.
The subject point moves onto the reference; the reference curve stays fixed for
initial application. The resulting ordinary coincidence constraint is bidirectional
for later edits. Existing locks can reject the edit; roles do not silently reverse.
Shift-click while selecting whole edges/shapes retains their existing additive
selection behavior.

Two selected meeting standalone line edges expose a local Corner angle field,
separate from the selection's rotation angle. Typing is a one-time edit; the lock
button creates an explicit angle relationship. The first edge changes around its
meeting endpoint and the second is the reference. Stored endpoint roles define
rays away from the corner, independent of line storage direction. The UI displays
the minor angle (0–180 degrees); the native equation retains its signed direction.
Later edits can drive either edge. While endpoints meet, they are temporary anchors
for the angle calculation; no coincidence record is added. Inspection, deletion
and Undo use the existing constraint display and document owner. This route is
for straight edges; individual rectangle-side controls remain in A2.

Two selected cubic/line/arc edges that already share an endpoint also expose
Tangent. Applying it uses the first selected cubic handle as the initial subject,
then stores an ordinary endpoint-junction tangent relationship. Cubic handle
length stays under direct user control. At a cubic-cubic junction, dragging either
handle retains that drag and reorients the opposite handle; selection order only
establishes the initial result, not a permanent driver/follower relationship.
