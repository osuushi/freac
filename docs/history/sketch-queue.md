# Completed groomed sketch queue

Original planning/reference material; old next-step language is not authorization.
This is historical planning, not a current work queue. Cubic editing supersedes
the original spline exclusion.

## Groomed sketch queue (2026-09-14)

Behavior is captured in the design's **Agreed curved editing and constraint
controls**. These are bounded outcomes, not an overnight completion promise.
A1, P1 and C1 are accepted. C2 standalone line relationships are implemented;
C3 point/straight-angle controls, C4 concentricity and line/circular tangency are
implemented; circular-pair/joined-endpoint tangency and F1 corner fillets are
verified; T1 intersection-aware trim is also implemented and regression-verified.
M1 transforms/local-control layout and O1 independent edge offsets are implemented
and verified. O2 closed-loop offsets and A2 rectangle-side bow/casting are also
implemented and verified. The authorized batch is complete; founder review using
the morning log is next. Each item received a short implementation brief,
ordinary-input acceptance, adjacent regressions and a coherent commit. No
subagents or architectural reset were used.

| Ticket | Outcome and acceptance | Dependencies |
| --- | --- | --- |
| A1 Arc bow and radius | Two side guides; drag through mouse or click/type radius; fixed endpoints, minor/major preservation; reselect/move/endpoints, mixed transforms, analytic snapping/intersections/fill, cancellation and Undo. Review this usable result. | Current circles/analytic regions |
| A2 Rectangle-side bow | Show bow affordances for individually selected rectangle sides; transition out of rectangle editing, preserve meaningful endpoint/shape relationships, disclose incompatible relationships before removal, Undo restores intact rectangle. Separate from A1 and corner fillets. | A1; constraint rewrite controls |
| P1 Point chooser | Diagram choices at coincident points, hover incident edges, multiselection and point-selection gradients; drawing still starts on unselected points. No automatic fuse. | A1 for arc tangents in diagrams |
| C1 Numeric locks and inspection | Explicit length/radius locks through PlaneGCS, edit/unlock, constrained coloring, selected-only icons/list, hover participants, delete/Undo, conflicting edit recovery. | A1 |
| C2 Line relationships | Horizontal/vertical, parallel, equal segment lengths; local selection actions, actual solver, inspect/delete and conflicting/redundant cases. | C1 |
| C3 Point and angle relationships | Explicit coincidence, Fuse/Unfuse and meeting-edge angle locks; detach without moving, then move independently; inspect/delete/Undo. | P1, C1 |
| C4 Curved relationships | Line/arc and curve/curve tangency; concentric circles/arcs; branch-stable dragging, radius edits and conflict recovery. | C1, A1 |
| F1 Corner fillet | Select two meeting lines; drag/type radius, trim lines and insert tangent arc atomically; radius edits preserve surviving support tangency; consume both original curves at their far endpoints, Undo restores corner. | A1, C4; constraint rewrite policy |
| T1 Intersection-aware trim | Preview/remove exact segment or arc span, circle-to-arc, empty/single-intersection circle deletion; preserve/remap relationships, confirm necessary losses, fill and Undo. | A1, C1–C4 for supported relationship rewrites |
| M1 Transform widget | Multiselection axis arrows/ring/pivot; drag and numeric movement/rotation; preserve rigid geometry and persistent locks, cancellation/Undo. Extend existing transforms. | A1; C1–C4 for constrained acceptance |
| O1 Edge offset | Independent parallel segment or concentric bounded arc/circle; side and local distance, collapse rejection, source unchanged, Undo. | A1 |
| O2 Loop offset | Unambiguous line/arc loop, sharp joins and whole-result preview; concave/collapsed/ambiguous cases, Undo and fill. | O1, T1 |

Ticket C1 includes only the solver support needed for its visible locks; C2–C4
extend it with their own complete routes. Do not build a generic constraint
framework first. Existing circle radius editing is extended by A1, not rebuilt
as an unrelated tool. Fillets move forward from S4 because they are now a primary
arc-creation affordance. The remainder of S3/S4 stays on the roadmap.
