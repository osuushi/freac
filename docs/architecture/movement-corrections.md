# Founder movement corrections

Read for work in this area, not on every resume. [Architecture index](../architecture.md).
Later founder decisions override earlier proposals.
Cubic editing/projection (2026-09-16) supersedes any earlier spline exclusion.

### Movement corrections from founder review (2026-09-15)

A rectangle curve hit uses the same opposite-edge-anchored resize as its midpoint
handle. It does not translate the entire convenience group. Interior/center drags
still translate the group; mixed whole-object selections retain rigid movement.
The edge target starts from the acquired curve point plus pointer displacement,
so pressing near an edge does not introduce an initial jump.

For whole-object and plane-axis movement, grid snapping quantizes translation
relative to the original anchor/pivot, not that anchor's absolute position. Existing
geometry targets and alignment guides still override grid coordinates; Option
bypasses geometry attraction while leaving displacement snapping active. Endpoint
and resize edits continue to snap their destination geometry to the world grid.

A normal click on a fully fused junction shows only a compact Unfuse action.
Shift-hover explicitly opens detailed point inspection, including narrowed detachment.
Independent coincident points retain their incident-edge diagrams. Selection still
creates no persistent links; Unfuse uses the same constraint edit and Undo.

Selection stores whole-curve IDs separately from selected point keys. The union of
geometry owners is a derived rendering/handle view, never evidence that a selected
endpoint's entire curve was selected. Mixed selection retains click order for
initial subject/reference intent. Constraint actions use the actual selected entities.
Point-on-edge coincidence stores one stable point reference and one edge ID. The
native calculator uses point-on-line/circle equations; the document independently
requires the point to remain on the visible segment/arc domain. This shares the
existing one-edit/preview/Undo path. Constraint actions and inspection use SVG
icons and names in the lower-left Existing/Available constraint sections.

Move is an explicit local action (M) for any selection. Its numeric/axis/ring
controls transform selected points as points and whole edges as edges, using the
gesture-start sketch. Selecting a rectangle side moves that side; selecting its
body moves all four. Escape leaves Move while retaining selection. Cmd/Ctrl+A
selects the active sketch's curves, except within native text editing controls.

Coincident badges move onto the other incident curve when placing them at the
point would cover the junction. Shift/Cmd/Ctrl selection passes through canvas
constraint badges to the underlying geometry; an ordinary badge click still
removes the constraint. This keeps participant placement from blocking pair selection.

Bowing a straight segment also removes its line/circular Tangent relationships:
their line-side definition cannot survive conversion to an arc with fixed endpoints.
Existing arc radius edits retain their circular tangencies. Point links survive
conversion; the ordinary removal notice and Undo cover the discarded constraint.

Loop offsets preserve fused endpoint connections between copied neighbouring edges,
including transitive source junctions. Copy references account for normalized loop
orientation and use new curve/constraint IDs. The copy is independent of the source;
unfused source corners remain unfused, and other constraint kinds are not copied.
Connection IDs are allocated once per offset gesture and accepted with its geometry
in the same Undo step. Single-edge offsets do not copy external point connections.
