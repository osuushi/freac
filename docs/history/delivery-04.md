# Delivery record 4: through 2026-09-16

Historical implementation/check reports, newest first. Old “next” instructions
are not authorization. Current user requests determine active work. Do not append new status here.

- **Architecture tightening implemented; founder review next (2026-09-15).**
  The three increments in the approved `arch-tightening.md` brief (since removed; retained in Git) are complete:
  one ordered typed selection, explicit temporary edit intent with local rectangle
  solver routing, and one active interaction owner for pointer/bow/fillet/offset/
  trim/numeric edits. Completed edits retain one snapshot Undo step; cancellation
  and failures retain accepted geometry. A shallow curved-corner guide now chooses
  a feasible hint size rather than throwing from redraw.
  All 82 native/model tests, strict TypeScript, Biome and the production build pass.
  Full Chromium/WebKit suites pass, followed by focused guide/selection/lifecycle
  checks after the final correction. Hidden Electron passed all full-suite geometry
  assertions; its two guide-rendering errors were reproduced, corrected and the
  affected arc/corner/selection/lifecycle routes rerun cleanly on the rebuilt app.
  Test apps/servers are closed. Pause here for the
  hands-on review route (historical; `git show 4241f50:docs/product-review.md`); no unrelated sketch or solid work
  is authorized by this brief. Physical iPad and Linux/Windows remain unverified.

- The process, design and roadmap have been written; the founder has reviewed the
  direction. Product interactions still need the hands-on reviews below.
- **Corner fillet guide implemented (2026-09-15), ready for founder review:**
  selected corners show a faint shallow arc. Drag its stroke to round the corner,
  or click for local radius entry. The guide replaces the text button without
  changing the geometry/constraint/Undo path. All four rotated corners, all sketch
  planes, cancellation, radius editing and adjacent fillet/bow routes pass in
  headless Chromium/WebKit and hidden Electron; 74 native/model tests pass.
  Follow-up clarified by the founder's unequal rectangle example: consume both
  original curves, pinning each far endpoint when reached, and keep the other
  outline edges untouched. The same guide supports line–arc and arc–arc corners.
  This supersedes stopping at the shorter support. Implemented and verified:
  78 native/model tests; headless Chromium/WebKit and hidden Electron cover
  curved-corner drag/type/edit, unequal-edge consumption, closure, Undo and
  adjacent fillet/bow routes. Ready for founder review.
- **S0 setup/shared world is implemented.** An isolated source export passed npm
  installation, typecheck, lint, build and hidden Electron launch on macOS arm64.
  Headless Chromium/WebKit passed explicit plane entry and orbit exit.
- **S1 is accepted as sufficient for now (founder review, 2026-09-14).** Ordinary-input routes pass
  in headless Chromium/WebKit and the built app in hidden Electron on macOS arm64:
  lines/rectangles, independent line drags and endpoint edits, all rectangle handles, rotated left/top
  drags on XY/XZ/YZ, mixed selection/transforms, local numeric edits, rejection,
  Delete/Clear and Undo/Redo. See the review route (historical; `git show 4241f50:docs/product-review.md`).
- **Automatic drawing attachments confirmed (2026-09-15):** apply the same rule at
  both ends. Unambiguous degree-one endpoints fuse; an unambiguous edge gains
  point-on-edge coincidence. Option suppresses attachment, and multipoints or
  intersections remain explicit. This supersedes the earlier open-policy status.
  These drawing rules are implemented and verified through ordinary input in
  Chromium, WebKit and hidden Electron; all 74 native/model tests and strict
  checks pass. Founder hands-on review is the next checkpoint.
  The founder selected backend PlaneGCS.
- **First S2 integration is founder-reviewed (2026-09-14):** existing rectangle editing uses
  PlaneGCS and the backend owns accepted geometry and Undo. Feedback: point clicks
  switch to Select; Select immediately drags coincident point targets together.
  **Circle editing is implemented:** center-radius drag,
  center/interior movement, circumference/numeric radius edits, snapping/fill and
  mixed transforms through the shared backend/Undo path. Explicit radius locks
  are included in C1; C4 below covers curved relationships. **A1 arc editing is founder-accepted (2026-09-14):** draw a line and
  use the side guides for drag-through-point or numeric radius conversion;
  edit endpoints/radius, move and rotate, fill and Undo. **P1 point disambiguation is founder-accepted (2026-09-14):** diagram
  choices, Shift multiselection/reopening, narrowed drags and incident-edge gradients.
  **C1 numeric locks with inspection/removal are founder-accepted:**
  line/rectangle lengths, circle/arc radius, explicit edit/unlock, quiet participation
  coloring, selected-only icons/list, hover and Undo. **C2 standalone line relationships
  are implemented and automated-verified:** horizontal/vertical, Parallel/Equal,
  first-selection subject/second-selection reference, bidirectional later edits,
  participant highlighting, removal and conflict recovery. Founder review is pending
  in the morning log (historical; `git show 4241f50:docs/product-review.md`).
  The overnight request authorizes continuing through the groomed queue without
  pausing at each review. **C3 is implemented:** explicit line-endpoint Fuse/Unfuse,
  narrowed linked drags, hub detachment preserving other links and Undo pass the
  full browser/hidden Electron routes. Circle-center links also pass the full
  browser/hidden Electron routes. Arc endpoint/center links, radius-locked endpoint
  drags and fixed-endpoint radius edits pass full Chromium/WebKit and hidden
  Electron verification. Separated-point coincidence and ordered Shift-selection
  are implemented and regression-verified. Straight meeting-edge angle editing
  and locks pass full Chromium/WebKit and built hidden Electron regressions.
  **C4 concentricity is implemented:** local ordered circle/arc pair actions,
  independent radius edits, shared center movement, inspection/removal and Undo
  pass Chromium/WebKit and built hidden Electron. **Line/circular tangency is
  implemented:** local ordered Tangent, finite-contact/side checks, circle/arc
  radius edits, line drag, inspection/removal and Undo pass full regressions in
  all three runtimes. **Circular-pair tangency is implemented:** external/internal
  circles, arc/circle and two-arc radius edits, containing-identity rejection and
  Undo pass full Chromium/WebKit and built hidden Electron. **Joined-endpoint
  tangency is implemented:** first-selection rotation, explicit links, locked
  radius edits, peer rotation and constrained junction dragging pass the same
  full regressions. **F1 corner fillets are implemented:** local drag/type creation,
  radius reselection/edit/lock, constraint-loss confirmation, rigid movement,
  finite-edge rejection and Undo pass full Chromium/WebKit and built hidden
  Electron. **T1 intersection-aware trim is implemented:** line/circle/arc spans,
  remnant editing, overlap choice, loss confirmation, rectangle conversion with
  surviving right angles, fill changes and Undo pass full Chromium/WebKit and
  built hidden Electron. **M1 transforms and local-control layout are implemented:**
  plane-axis drag/numeric movement, rotation ring/pivot, rigid constraint rejection,
  cancellation/history and small-arc control separation pass browser/hidden
  Electron routes. **O1 independent edge offset is implemented:** line/circle/arc
  drag and signed numeric copies, source locks preserved, ordinary result edits,
  collapse rejection, cancellation and history pass browser/hidden Electron
  routes. **O2 closed-loop offset is implemented:** all-plane rectangle and mixed
  line/arc loops, signed inward/outward copies, sharp joins, concave/collapsed
  rejection, fill and subsequent edits pass browser/hidden Electron routes.
  **A2 rectangle-side bowing is implemented:** selected-side guides, fixed endpoints,
  loss confirmation, ordinary arc conversion, radius/linked-endpoint editing,
  rotated profiles, fill and Undo pass full browser/hidden Electron regressions.
  **Founder review corrections implemented; awaiting hands-on review (2026-09-15).**
  The batch includes lightweight fused-point/Unfuse controls, automatic bow/trim conversion,
  bowing through incompatible line constraints, explicit constraint icons on the
  other participant, mixed point/edge selection and coincidence, Cmd/Ctrl+A,
  an explicit Move tool (M), scroll-pan/Alt-scroll-orbit, and fillets directly on
  selected corners including rectangles, midpoint bow controls, edge-only rectangle
  dragging, and displacement-based grid snapping for movement. All 70 native/model
  tests, strict TypeScript/Biome, build, complete headless Chromium/WebKit and built
  hidden Electron routes pass. Selected points are distinct from whole edges;
  additive selection passes through constraint badges without deleting constraints.
  Follow-up review fixes: tangent-constrained segment bowing now discards the
  obsolete line tangency, and loop offsets retain source endpoint fusion within
  the independent copy. Targeted bow/joined-tangent and complete loop-offset
  routes pass Chromium/WebKit/hidden Electron; all 72 native/model tests pass.
  Pause for the usable review (historical; `git show 4241f50:docs/product-review.md`)
  before unrelated S3/S4 expansion.
- S1 review feedback: independent line drags retain the tool without continuation;
  enclosed segment regions now show translucent fill. Click-selected points and
  hover guides separate moving from drawing; Option bypasses geometry attraction
  and a toolbar toggle controls the grid. Region selection remains S3.
- No solid-tool or expanded terminal work is active. Stage completion requires
  its stated evidence and review; update this section when that status changes.
