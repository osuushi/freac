# Symmetric drawing attachments

Read for work in this area, not on every resume. [Architecture index](../architecture.md).
Later founder decisions override earlier proposals.
Cubic editing/projection (2026-09-16) supersedes any earlier spline exclusion.

### Symmetric drawing attachments — founder confirmed 2026-09-15

Both the start and finish of a drawing gesture apply the same attachment policy.
A geometry snap to one unambiguous degree-one endpoint creates endpoint coincidence
(Fuse). A snap to one unambiguous edge creates point-on-edge coincidence, including
line/arc/circle edges and their midpoints. That relationship allows sliding along
the finite edge; it is not a midpoint or dimension lock. Multipoints, junctions,
intersections and coincident center/edge choices remain explicit. Centers by
themselves are placement snaps, not endpoint or edge attachment targets.

The drawn line or cubic curve's two endpoints and a rectangle's two dragged corners participate;
a circle's starting center can attach, but its radius handle is not a persistent
point. Start suppression is captured on pointer-down; end suppression follows
Shift at the current pointer position/release. Grid/alignment placement with
Shift cannot accidentally create a link. Option controls symmetric creation.
For centered creation the press point is a center, not an endpoint attachment;
only actual resulting endpoints may acquire relationships. Hover shows Fuse or Coincident where
applicable. Final geometry must still meet the target after numeric edits.

Creation adds ordinary coincidence/incidence records to the same temporary
candidate and accepts them with geometry in one Undo step. Constraint IDs stay
stable through the gesture; moving away from a target removes its temporary
attachment. Subsequent selection or movement never adds attachments by itself.
Unfuse or the constraint list can remove the accepted relationship. Bow conversion
retains point-on-edge relationships, including endpoints attached to another edge.

### Grid placement near edges

With grid snapping enabled, nearby edges offer intersections with horizontal and
vertical grid lines instead of unrestricted closest-point placement. Choose the
nearest of these intersections and the ordinary grid corner, so off-edge grid
corners remain reachable. A segment along a grid line retains ordinary grid
spacing. Existing endpoint, midpoint, center and curve-intersection feature snaps
retain their priority. With grid disabled, edges offer continuous placement;
Shift bypasses geometry while retaining the independent grid setting.

Grid/edge intersections are placement candidates, not new geometry or grid
constraints. An unambiguous sketch edge still receives the ordinary drawing
attachment at either end of creation; off-edge grid placement creates no link.
