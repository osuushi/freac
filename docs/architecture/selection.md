# Sketch planes and selection

Read for work in this area, not on every resume. [Architecture index](../architecture.md).
Later founder decisions override earlier proposals.
Cubic editing/projection (2026-09-16) supersedes any earlier spline exclusion.

## Interaction contracts

The defaults below make the first implementation reviewable. Changes driven by
founder feedback update these contracts before further tools depend on them.

### Plane, tool and selection

- Hidden sketches and bodies remain selectable in the Entities panel, including
  when all bodies are hidden. Selection does not reveal them; Delete/Backspace
  removes them through ordinary document history. Viewport picking still skips them.

- Sketch mode is an aligned editing view of the same 3D world, not a separate
  canvas. Use one world origin and coordinate mapping for both. Display a clear
  world-origin marker with consistent X/Y/Z labels and colors. If it moves off
  screen, an orientation/direction cue refers to that same origin; do not move
  the origin to the viewport center.
- XY/XZ/YZ appear as faint infinite grids, fading with distance and angle instead
  of ending at small rectangular patches. Emphasize the active plane without
  replacing the world background. Adapt visible grid density to zoom while
  preserving unit spacing labels, axis alignment and snap locations. Choose a
  coordinate plane through three translucent patches on their actual support planes.
  Each patch projects the bounding box of all visible bodies/sketches into its frame,
  extends 20% beyond each side and retains a 40 mm minimum around its origin. Accepted
  geometry sizes the patches; active gestures freeze them. Plane widgets do not
  contribute to those bounds. Body silhouettes mask plane fill, retaining the faint
  grid where the plane is in front; geometry occludes planes behind it. Explicit
  reference picking can show a stronger fill. World, active-sketch and saved-plane
  gridlines retain visible contrast over both the background and body silhouettes.
  Ordinary body/sketch geometry always wins over plane interiors, regardless of
  which lies nearer the camera. Among otherwise available reference patches, depth
  decides and saved planes win ties. No floating plane labels. Keyboard and
  screen-reader plane entry lives in Tools as Sketch on XY/XZ/YZ.
- Holding a primary pointer still for 300 ms in Modeling opens an explicit overlap
  chooser. Ordinary clicks retain precedence; movement beyond the normal drag
  threshold cancels the hold (6 px for touch). A delayed progress ring signals it.
  Candidates include front-facing body faces, edges with at least one locally
  front-facing adjacent face, whole bodies, and visible canonical/saved plane
  patches. Back/back edges are excluded; silhouette edges remain eligible. Curved
  faces use the triangle normal nearest the hit on the edge. Candidates are sorted
  by camera distance, including occluded front-facing geometry. Hidden entities
  are excluded.
  A disk grows from its center to a fixed circular outline over the hold delay; it indicates elapsed hold time, not
  processing. The delay is currently fixed; a future preferences window can expose it.
  Each choice shows the actual target geometry in the current camera orientation,
  with subdued body context and shared thumbnail framing. Plane thumbnails include
  visible coplanar sketches in their actual positions; hidden sketches are omitted.
  Sketches off the visible defined planes get their own Sketch choice when a curve
  or enclosed region overlaps the press. Coplanar sketches stay represented by the
  plane thumbnail without a duplicate sketch choice. Sketch choices highlight their
  curves and select the whole sketch on release. They share camera-distance sorting.
  Text identifies the type;
  canonical planes additionally name XY/XZ/YZ. Hover/focus highlights that exact
  viewport entity, including occluded targets. Keep the pointer held, drag over a
  thumbnail, and release to choose; releasing outside cancels. Captured touch uses
  screen-coordinate hit testing, so the thumbnail and viewport highlight follow
  the finger. No second click/tap is needed. Shift adds and
  Command/Ctrl toggles geometry. Canonical planes enter their workspace; saved planes
  become selected with existing Move/Sketch actions. Escape, outside press, navigation,
  view/document changes and window blur dismiss the chooser. The hold's trailing
  click is consumed. This is transient UI state and creates no history entry.
  Sketch point disambiguation retains its existing interaction.
- Entering a sketch animates the camera into its aligned plane view while preserving
  spatial context. The transition interpolates orientation and the view target; a
  region double-click also centers and fits that region. Orbiting out reveals the
  same geometry in place. No independent sketch camera reset, unit change or drawing
  relocation. An eventual face-supported
  sketch has a local origin distinguishable from the world origin; it does not
  redefine the world axes. Grids and markers must not hide outlines or intercept
  geometry picking; explicit plane-entry targets handle plane selection.
- R arms Rectangle without choosing a plane. Explicitly enter XY, XZ or YZ.
  Merely viewing a plane does not save an empty sketch. Orbit exits planar editing;
  pan/zoom retain it. Re-entering a plane resumes its first visible coplanar sketch;
  hidden sketches are skipped. Selecting a sketch highlights other visible sketches
  on that plane and offers a merge control on each peer to merge it into the selected sketch.
- In modeling, a selected whole sketch shows occluded curves and filled regions
  with a dim tint. Its curves and regions take picking precedence over solid faces
  and edges, retaining normal depth order among selected sketches. Clearing selection
  restores ordinary picking; hidden sketches remain excluded. This is view state only.
- Selection occurs on a completed click. In modeling, double-clicking a body face
  or edge selects its whole body; a single face click retains face selection.
  Enter on one selected planar face or whole sketch opens its sketch workspace,
  while active operations retain their own Enter handling. In the entity panel,
  double-click renames inline and dragging reorders rows within their group;
  selecting a sketch and pressing Enter enters it. Canvas sketch/region double-click
  continues to enter its existing workspace.
  Curve selection exposes hollow point
  handles; it does not select those points. A clicked endpoint, midpoint, rectangle
  handle or center has its own typed transient target and filled marker.
  One ordered selection stores curve/group IDs or endpoint/midpoint/center/handle
  references. Whole-curve selection, point selection and highlighting owners are
  separate derived queries; no consumer may mutate a second selection collection.
  Rectangle context exposes applicable convenience controls and does not mean
  the entire rectangle was selected. Gesture cancellation restores typed targets
  in one operation, including their order.
  A completed point click switches to Select. In Select, press-drag edits a point
  immediately, including all geometrically coincident point targets at that location.
  This is transient selection, not persistent fusion; the point chooser can narrow
  the drag to explicitly selected point targets. Drawing tools still drag from points to create geometry with a snapped
  start. Hover uses an amber guide and changes neither selection nor the document. An intact
  rectangle also has a center handle/interior group target for moving the whole
  rectangle. Double-click connected linework selects its connected component.
- Shift adds without removing or reordering existing targets; Command/Ctrl toggles
  (also when Shift is held). This applies to sketch/model canvas picks, Entities,
  overlap choices and the point chooser. Modified double-clicks retain these
  selection rules rather than entering a sketch or selecting a connected component.
  Body face/edge double-clicks promote to whole-body selection: Shift adds and
  Command/Ctrl toggles against the selection before the first click, preserving
  unrelated targets and order without retaining intermediate face/edge clicks.
  Command-click toggles; Command-drag still orbits after the pointer drag threshold.
  Shift-box adds and Ctrl-box toggles, preserving unrelated selected points.
  Dragging a selection box from empty space
  selects contained geometry. A local overlap chooser resolves coincident targets;
  hover and activation use the same hit result. Picking is not “last array item.”
- Point handles, curves, groups and regions are distinct target types. Picking a
  filled region must not silently move whole curves that extend beyond its boundary.
  Geometry transforms operate on selected entities/groups; region selection is
  for profile actions and stays distinct from curve selection.
- Blank click clears selection. Escape cancels an unfinished gesture/field edit,
  then dismisses the active tool/selection on a subsequent press, then exits the
  plane when idle. It never deletes previously accepted drawing.
- Keep the selected set after a move or numeric edit. Delete removes that set and
  its now-invalid constraints in one Undo step. Clear affects only the active
  sketch and leaves its plane usable. Both are actual tested controls.

### Point disambiguation

Click a coincident point location to open a local chooser of incident-edge diagrams.
The ordinary default includes all colocated point targets. Each stored coincidence
component appears as one diagram containing all its incident branches; independent
colocated points remain separate diagrams. Choosing a diagram selects all its point
targets, Shift-click adds the component, and Command/Ctrl-click toggles it as a unit.
Hover highlights all branches of that component. Shift while hovering the junction
reopens the chooser with those choices indicated. Selection does not create point links.

The next point drag uses the chosen targets. Whole-curve multiselection keeps its
existing Shift-add/Command-toggle behavior; a plain point click does not silently
reduce an existing whole-curve selection. Explicit chooser selection does narrow
it. Drawing tools continue drawing from visible unselected endpoints. Point choices
are editor state, never geometry. Their ordered targets participate in selection
Undo; the chooser itself clears on tool/history/plane changes. Escape dismisses
the chooser first while keeping the chosen points.

Point selection fades blue along incident edges; hovering a diagram fades amber
along its branches. Center choices highlight associated curves, and concentric
center diagrams use a shared scale. A rectangle corner is one choice with two
incident edges; coincident independent endpoints remain separate choices. All
candidates are shown with wrapping, not truncated at four. Unfuse is shown only when
the chosen targets have detachable coincidence links. Unfusing a selected component
immediately restores its separate diagrams. Identical overlapping
geometry can still yield identical diagrams; moving a chosen duplicate is explicit.

Selecting the entire physical degree-two endpoint junction offers Tangent for its
two incident edges, including two unfused endpoints that happen to be colocated.
The convenience creates an ordinary tangent relationship without fusing those
points. A junction with any other number of incident edges offers no point Tangent.

The chooser stays stable while addressing the same junction, so Shift-click does
not replace a button during its click. Dimensions/rotation controls step aside
while it is open. Actual geometry edits still use the existing backend/Undo path.
