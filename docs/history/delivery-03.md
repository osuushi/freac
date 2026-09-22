# Delivery record 3: through 2026-09-16

Historical implementation/check reports, newest first. Old “next” instructions
are not authorization. Current user requests determine active work. Do not append new status here.

- **Standalone Booleans accepted by founder (2026-09-15):** select two or
  more whole bodies and use local Union/Subtract/Intersect. The exact result stays
  temporary until Enter/checkmark/next selection; Escape restores all inputs.
  Subtract proposes the first-selected target, with blue target/amber cutter
  outlines and a local target-cycle button. Commutative operations have no roles.
  Keep originals preserves cutters for Subtract, all inputs otherwise; retained
  originals and results have distinct IDs. All split solids survive; a valid empty
  intersection is labeled explicitly. One Undo reverses the operation. Actual
  Chromium/WebKit/hidden Electron routes cover selection order, mode changes,
  target reassignment, keep, splits, empty acceptance, cancellation, entity/viewport
  completion, Undo/Redo and Save/Open. 97 native/model tests pass, including
  touching/disjoint operands and invalid requests. Adjacent Move/extrude/camera
  routes pass. TypeScript/build pass; Biome retains a reviewed 301-line Move
  controller warning (shared body actions were moved out of it).
  Founder accepted functionality, with further UI iteration deferred; proceeded
  to edge selection/boundaries.


- **Move/Duplicate accepted by founder (2026-09-15):** select body rows or
  explicitly promote a face to its body, then M/local Move. World-axis arrows,
  rotation rings, click-to-type and movable pivot operate on one or multiple bodies.
  Review feedback: axis arrows replace letters, controls have more separation,
  and the center anchor directly drags in the view plane with independent hit
  priority. Anchor movement changes no geometry/history; click retains precise
  axis positioning, and Escape cancels an unfinished anchor drag. The default
  anchor uses combined bounding-box center and follows edits/history; manually
  repositioned anchors remain custom. Camera gestures work over floating widgets
  and numeric fields, retaining the active-drag navigation guard.
  Drag release/numeric Enter accepts one exact transform; Duplicate creates
  independent copies plus placement in one Undo step (Enter supports in-place copy).
  Escape cancels temporary geometry. Axis geometry snaps and Option bypass work.
  Bodies keep topology identities and entity-list order when moved; copies get fresh
  identities. Save/Open retains placement and transformed-face sketching works.
  94 native/model tests, strict TS/Biome/build and actual Chromium/WebKit/hidden
  Electron routes cover these operations plus adjacent sketch placement/extrusion.
  Founder said “Good enough for now, onward”; proceeded to standalone Booleans.
  Mesh/mixed-body work remains explicitly deferred.


- **Direct body tools requested (2026-09-15), direction approved:** founder
  requested Move, Duplicate, standalone Booleans, selected-edge fillets,
  face-selection boundary edges and Offset. [The body-tool proposal](../body-editing.md)
  specifies selection, local controls, ownership and Undo. First proposed delivery
  is Move/Duplicate, then a hands-on review. Founder corrections: only subtraction
  has target/tool roles; face offset must accommodate curved and future freeform
  surfaces. Mesh-backed geometry is a deferred feasibility discussion, not an
  implementation prerequisite. Move/Duplicate is now implemented as recorded above.

- **B1 graphical extrusion follow-up (2026-09-15):** selected profiles/planar faces
  show a normal-axis double arrow at their combined area centroid (holes excluded).
  Drag follows the projected axis; end-on views use a depth glyph and vertical
  drag. Click exposes numeric entry; compact Boolean icons appear only during
  extrusion, with tooltips and existing shortcuts. Repeated drags retain the
  active axis through preview replies. Temporary-result/Undo semantics are unchanged.
  Centroid/oblique/repeated drag and adjacent modeling/solid checks pass
  Chromium/WebKit/hidden Electron; live-preview scheduling passes Chromium/WebKit.
  Native/model tests, strict TS/Biome and build pass. Return to founder review.

- **B1 orientation/depth/navigation follow-up (2026-09-15):** removed the earlier
  vertical orbit inversion. Sketch strokes, fills and highlights now obey body
  depth while coplanar surface sketches remain visible. The left entity viewer
  selects and shows/hides individual bodies/sketches; double-click enters a sketch.
  Tools are at the top right. Visibility is session UI state, not document history.
  Actual input and rendered-pixel checks pass Chromium/WebKit/hidden Electron,
  along with camera, side/bottom face and full solid/archive routes. All 93
  native/model tests, TypeScript, Biome and production build pass. Return to review.

- **B1 preview-latency follow-up (2026-09-15):** completed extrusion previews now
  display while a newer drag target computes; repeated identical snapped targets
  do not recompute. Acceptance still waits for the latest target. Real-kernel tests
  with controlled response delivery pass Chromium/WebKit, including live preview,
  duplicate suppression and late invalidated results. The existing full solid loop
  passes hidden Electron; TS/Biome/build pass. Return to founder review.

- **B1 ready for founder review (2026-09-15). Pause for hands-on product feedback.**
  The complete plate → hole → split → result-face sketch loop works with exact
  materialized bodies, independent movable source sketches, local temporary extrusion,
  U/S/I/N and explicit target chips. Use edge copies exact lines/arcs into editable
  sketch curves; body snapping is coordinate-only with Option bypass. Hide bodies
  makes covered sketches accessible, and Select face resolves overlapping face/profile
  picks. Save/Open preserves exact shapes and IDs, rebuilding display data.
  93 native/model tests, strict TS/Biome and build pass. Actual pointer/keyboard checks
  pass Chromium/WebKit/hidden Electron for the full solid/archive loop, target choice,
  empty intersection, dragging/cancellation/orbit, line/arc reuse, body snapping,
  source independence, side/bottom faces with holes and adjacent sketch interactions.
  Test apps are closed. The installed SDK setup is verified locally; clean OCCT source
  build, Linux/Windows and physical iPad remain unverified. No autosave/unsaved-work
  prompt yet. Review route: product review (historical; `git show 4241f50:docs/product-review.md`). Do not start revolve,
  terminal work or broader body tools before this feedback.

- **B1 implementation started (2026-09-15), founder authorized “let's get started.”**
  First integrated slice: distinct Sketching/Modeling modes, independently movable
  sketch objects, arbitrary-plane re-entry by sketch ID, and selected closed
  profiles with holes. This slice is implemented: 90 native/model tests, strict
  TypeScript, Biome, production build and focused Chromium/WebKit/hidden Electron
  checks pass. The checks cover placement/re-entry, coplanar identity, profile holes,
  deletion/history and adjacent drawing, selection, bowing, trimming and transforms.
  A short-edge bow/midpoint hit conflict found by regression was corrected and
  affected routes rerun. Next is exact-solid/face-return integration, continuing
  toward the complete plate→cut→split→face-sketch review route. Materialized bodies
  remain selected; labels/scripts and persistent face attachment are deferred.

- **Sketch editor accepted as useful for real design; solid-loop planning active
  (2026-09-15).** Founder feedback after direction-aware bowing: sketching still
  has substantial work ahead, but is now usable for design. Plan the continuing
  sketch → extrusion/Boolean → planar-face sketch loop in
  [the proposed B1 design](../sketch-solid-loop.md). This supersedes the pending
  review stop below for the latest sketch corrections. It does not mark S3–S5
  complete. This records the earlier planning transition; the implementation and review
  status above supersede that planning-only scope. Terminal expansion stays deferred.

  **Architecture clarification:** sketching/modeling are distinct modes and
  sketches are movable objects. Creating a body does not maintain a dependency
  on its visible source sketch; later sketch edits/moves/deletion leave bodies
  unchanged. The earlier source-edit propagation requirement is superseded.
  Materialized exact bodies are selected; direct geometry edits serve both manual
  tools and the agent. Future face/group labels and explicit optional scripts are
  recorded, with scripting deferred. Current discussion: operation correspondence
  for face/edge identity, label propagation and initial face placement versus
  persistent sketch attachment. The current B1 delivery status is recorded above.

- **Review follow-ups (2026-09-15):** constraint actions now live in the lower-left
  Existing/Available sections; existing relationships are not offered for addition.
  Multiple selected segments now show bow guides and become separate arcs with a
  shared radius and fixed endpoints; selected arcs can be jointly radius-edited.
  Focused pointer/keyboard routes pass Chromium/WebKit and hidden Electron,
  including rectangle casting, rejection, cancellation, Undo/Redo and adjacent
  selection/transform/fillet routes. All 83 native/model tests, strict TypeScript,
  Biome and the production build pass. Test apps/servers are closed.
  Both corrections are ready for founder review; pause for hands-on feedback.

  Direction follow-up: parallel/collinear segments take precedence and bow in the
  same physical direction. Otherwise every selected segment must bound exactly one
  closed region and bows inward/outward consistently with that region. Ambiguous
  selections hide multi-bow guides; hovering darkens the matching guides. Existing
  arcs retain their sides for joint radius edits. All 86 native/model tests pass;
  focused Chromium/WebKit and hidden Electron verification covers eligibility,
  hover, separate regions, reversed lines, geometry/history and adjacent editing.
  Strict TypeScript, Biome and production build pass. Ready for founder review.

