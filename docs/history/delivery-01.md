# Delivery record 1: through 2026-09-16

Historical implementation/check reports, newest first. Old “next” instructions
are not authorization. Current user requests determine active work. Do not append new status here.

- **3D tool cleanup and Modify selection ready for founder testing (2026-09-16):**
  Filled regions default to Extrude, faces to Offset, bodies to Move and edges to
  Fillet. Toolbar/E/O/M/F choose tools; Shift+F chooses Chamfer and Shift+R Revolve.
  A small edge icon switches Fillet/Chamfer during preview. One tool exposes local
  handles; fresh selections restore defaults, and preview replies retain intent.
  Modify selection removes/isolates edges or faces, expands through face-edge
  incidence, selects owners or face-set boundaries, and clears without model Undo.
  Body actions now live in the toolbar. All 169 model/native tests pass. Focused
  ordinary-input and adjacent modeling routes pass in headless Chromium/WebKit
  and hidden Electron, including invalid recovery, mode switching, tangent chains,
  body transforms, offsets, revolve, cleanup, draft, automatic Union, Undo/Redo and
  Save/Open. Build/typecheck pass; Biome has only existing/unrelated warnings.
  Full sketch UI suites, Linux/Windows builds and iPad input were not rerun.
  Next: founder testing via the review route (historical; `git show 4241f50:docs/product-review.md`); both requested
  tickets are delivered. Prior draft/cleanup product reviews remain pending.

- **Extrusion draft ready for founder review (2026-09-16):** Local Draft value
  with Angle (°)/Offset (mm) dropdown. Conversion preserves the current shape;
  length changes hold the selected quantity fixed. Offset is per wall, positive
  expands material and narrows holes, in either extrusion direction. Draft stays
  temporary through dragging and numeric edits, shares Boolean/cleanup/one Undo,
  rejects collapse and recovers by editing. Straight/circular and cubic profile
  paths are covered by native checks; general curves use OCCT sweep tolerances.
  All 166 model/native tests pass. Headless Chromium/WebKit and hidden Electron
  verify conversion, length changes, invalid recovery, existing-face drag/cancel,
  cleanup, Undo/Redo, Save/Open and adjacent ordinary extrusion/automatic Union.
  Local controls move left when the toolbox would hide them; screenshots reviewed.
  Build/typecheck pass, with only existing Biome size warnings. Full UI suites,
  Linux/Windows builds and iPad input were not rerun. Next is the
  draft review (historical; `git show 4241f50:docs/product-review.md`), not another feature.

- **Automatic Union correction (2026-09-16):** Extrude/Revolve automatic mode
  now includes touching bodies when it resolves to Union. Previously it displayed
  Union but skipped contact target discovery until Union was explicitly clicked.
  A native regression reproduces the old failure and checks automatic/explicit
  equivalence plus overlapping subtraction; all 160 model/native tests pass.
  Repeated face extrusion without clicking Union, commit and Undo/Redo pass in
  headless Chromium/WebKit and hidden Electron. Explicit New body still keeps
  touching solids separate; ordinary Union retains subdivisions. Retry this with
  the cleanup review below; no new tool is authorized.

- **Explicit solid cleanup ready for founder review (2026-09-16):** Founder requested
  optional cleanup at modal completion and on selected bodies/faces/edges, then
  explicitly chose to keep cleanup within bodies and use Union separately.
  Extrude, Revolve, Boolean, Fillet/Chamfer and face offset now offer **Commit and
  clean up**. Selection cleanup previews eligible topology and accepts/cancels;
  ordinary completion preserves subdivisions. Offset retains its established
  contact absorption, but an ordinary offset no longer refines unrelated topology.
  Cleanup protects unselected face boundaries and remote edge breakpoints, preserves
  exact volume and body identity, and shares one Undo with the operation. No-op
  cleanup creates no history; failed modal cleanup retains the original candidate.
  The supplied three-box fixture was opened through actual controls: cleanup alone
  retains three bodies; Union plus cleanup yields six faces/twelve edges at
  13,200 mm³. All 159 model/native tests pass. Headless Chromium/WebKit and hidden
  Electron cover body/face/edge cleanup, ordinary/modal acceptance, cancellation,
  reselection, Undo/Redo, no-op and Save/Open, plus fillet/offset/revolve routes using
  the new completion action. Build/typecheck pass; only preexisting Biome size
  warnings remain. Full UI suites and non-macOS builds were not rerun. Next is
  founder review of cleanup (historical; `git show 4241f50:docs/product-review.md`), not a new solid tool.

- **Interactive performance follow-up (2026-09-16):** Founder redirected work to
  noticeable drag latency and kernel CPU use. Release `-O3` was already enabled
  for OCCT, PlaneGCS and the wrapper. Delivered native preview cancellation,
  supersession between fillet/offset feasibility probes, removal of unnecessary
  sweep overlap/contact calculations, conservative bounds rejection and bounded
  OCCT Boolean/mesh parallelism. Latest-only pointer coalescing remains in place;
  accepted edits remain serialized and cannot be cancelled by preview controls.
  Added opt-in kernel phase timings and a repeatable five-box benchmark (see
  [native README](../../native/kernel/README.md#interactive-performance)). Synthetic
  median new/auto/union calls improved from 24/29/38 ms to 8/17/23 ms on this Mac.
  All 145 model/native tests and focused extrusion, fillet, face-offset, revolve
  and lifecycle routes pass in headless Chromium/WebKit and hidden Electron.
  Browser checks also cover cancellation while a real native reply is delayed,
  stale-result retirement and the next accepted edit. Full UI suites and other
  operating systems were not rerun. The founder is preparing a fixture: next is
  profiling that exact drag, not claiming the reported lag is resolved.

- **Cubic Bézier editing and projection ready for founder review (2026-09-16):** Founder
  approved ordinary cubic Bézier sketch geometry and controlled approximation of
  projected body curves, including conics and splines. This supersedes the old
  spline deferral; general NURBS editing and semantic ancestry are not required.
  Project onto an active sketch plane, a coordinate plane (XY/XZ/YZ), or a planar
  face to create/reuse its sketch. Multiple source faces project their combined
  boundary, excluding shared internal edges; faces can be toggled inside Project.
  Perpendicular, unclipped, independent editable curves; temporary preview,
  explicit acceptance/cancel, one Undo. Preserve analytic lines/circles/arcs when
  natural. Future agent precision recovery may make task-authorized corrections,
  state its assumptions, and remain undoable without a mandatory approval ritual.
  Implemented Curve/B creation, independent tangent handles, endpoint/selection edits,
  fused closure, trim, closed regions and native solid-profile export. Projection
  accepts both entry routes with a 0.001 mm cubic approximation budget, analytic
  preservation where natural, endpoint connectivity and coplanar workspace reuse.
  142 model/native tests pass, including face-set boundaries, cone-cut parabola/hyperbola and edge-on
  circle cases. Headless Chromium/WebKit and hidden Electron verify ordinary controls,
  cancellation, Undo and Save/Open. Cubic-specific persistent constraints, offsets,
  corner fillets and analytic recognition remain outside this increment.
  Loft remains deferred. Pause at the cubic/projection review (historical; `git show 4241f50:docs/product-review.md`).
  Handoff baseline: `450e205` delivers cubics/projection; `c00e797` adds face sets
  and coordinate-plane targets. Implementation and automated interaction checks
  are complete; founder acceptance of this latest follow-up is still pending.
  Next action is feedback on this flow, not another solid tool or agent integration.
  Latest follow-up ran all model/native tests and focused projection interaction
  routes on all three hosts, not the entire UI suite. Build/typecheck pass; Biome
  retains the existing 301-line `body-move-controls.ts` warning.

- **B3 Revolve/helix overlap follow-up delivered; founder moved on (2026-09-16):**
  Founder accepted the offset follow-ups and authorized moving onward. The supplied
  chamfer fixture passed exact solid validity and self-intersection checks; its
  volume matched an independent footprint calculation. Its two INTERNAL face edges
  are deferred cleanup, not internal walls. Founder approved
  [Revolve](../revolve.md), with straight sketch/body edges as axes and total-height
  helical sweeps: zero height is ordinary revolve; any nonzero height permits
  multiple turns. The complete profile/axis/angle/height/Boolean loop is implemented:
  temporary results, explicit acceptance/cancel, one Undo, and continued sketching
  on partial planar faces. 134 native/model tests and headless Chromium/WebKit plus
  hidden Electron routes pass, including the adjacent extrusion regression.
  Both supplied axis-touch and overlapping-turn captures now replay successfully,
  including the pentagon at 20°. Crossing line/arc profiles split on the axis;
  valid screw pieces union, with holes removed before union so other turns can
  fill them. Empty section results are rejected rather than silently lost. Native
  checks cover signed sweeps, overlapping cavities and independent volumes;
  ordinary controls cover the new cases, acceptance, cancellation, Undo and reopening.
  This supersedes the initial overlap/crossing rejection. Valid helical patch seams
  may remain. Founder subsequently chose projection next and deferred Loft; the
  current review gate is the cubic/projection entry above. Broader kernel
  reconstruction is not implied by that transition.

- **Developer bug fixtures:** Capture fixture saves exact accepted/preview models,
  current edit and UI context into ignored `.cache/fixtures`, without changing the
  active tool. Founder shares the path; agents inspect files directly without
  computer use. The latest cleanup fixture is covered by the explicit-cleanup review above.

