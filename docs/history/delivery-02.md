# Delivery record 2: through 2026-09-16

Historical implementation/check reports, newest first. Old “next” instructions
are not authorization. Current user requests determine active work. Do not append new status here.

- **Planar offset contact/merge accepted (2026-09-16):**
  On reaching a same-facing parallel neighbor, the moving finite face absorbs it
  and both continue together. Coplanar seams disappear, the actual merged preview
  face stays highlighted, and reversing restores the step. Unrelated parallel
  planes remain fixed. Invalid overshoots settle on verified geometry; the field
  reports the achieved distance. Accepted bodies remain unchanged until completion.
  124 native/model tests cover both directions before/at/beyond contact, exact
  volume and six-face/twelve-edge topology, rotated successive steps, unrelated
  faces, fresh merge IDs, limit reversal, Undo and reopening. Headless Chromium,
  WebKit and hidden Electron exercise the ordinary stepped-body draw/extrude,
  drag/type/highlight/cancel/Undo/Save/Open route and adjacent face-edit controls.
  Build and strict TypeScript pass; existing Move-size and bundle-size warnings
  remain. The founder accepted the stepped-face behavior. General
  curved consumption and whole-body split/removal remain outside this increment.

- **Automatic face-offset chains ready for review (2026-09-15):**
  Starting a normal offset selects and highlights the connected tangent face
  chain, including rounded wall and chamfer strips. Sharp boundaries stop it.
  Native topology supplies the same closure to presentation and direct edits;
  entry changes no geometry, dragging continues, cancellation retains selection,
  and acceptance is one Undo. Fillet-radius editing keeps its separate blend-only
  grouping, so it does not move support walls.
  All 119 native/model tests, build and strict TypeScript pass; Biome retains only
  the existing Move file-size warning. Tests cover seed independence, sharp exclusions, toroidal/spherical chain
  offsets and collapse guards. Chromium/WebKit/hidden Electron exercise wall and
  chamfer chain entry, highlight, drag, cancel and Undo, plus the previous existing
  fillet/chamfer editing routes. Next review: offset these chains in actual models.

- **Existing fillet/chamfer editing corrections ready for review (2026-09-15):**
  Existing constant-radius fillets now expose radius editing, including circular
  rims and connected spherical corner patches. Current BRep removal/reconstruction
  keeps support walls fixed without stored construction history. Conical chamfer
  faces now expose Offset. Planar chamfer drag direction includes surface handedness
  and agrees with the already-correct signed numeric offset.
  117 native/model tests cover convex/concave/rim/corner radius edits, repeated
  edits and archive reopening, support preservation and conical offsets.
  Headless Chromium/WebKit and hidden Electron verify planar chamfer outward drag,
  toroidal radius entry/drag and conical chamfer offset, Undo/cancel, plus the
  existing planar/hole/multi-face/archive/face-sketch routes. Build and strict
  TypeScript pass; Biome retains the existing Move file-size warning.
  General freeform/variable-radius blends remain unsupported; failed reconstruction
  leaves accepted geometry intact. Review these corrected face controls next.

- **Initial planar/cylindrical face offset reviewed with corrections above (2026-09-15):**
  Local signed push/pull and cylinder diameter editing now operate directly on
  accepted bodies. Multiple faces share a signed material-outward offset; each
  uses its own normal. Preview survives drag release, Enter/next selection accepts,
  Escape restores the body, and zero makes no edit. Repeat edits, one-step Undo,
  topology identity and Save/Open are verified.
  Native checks cover planar faces beside holes, Ø3 → Ø5 hole correction, bosses,
  multiple faces/bodies, collapse rejection and tangent fillet neighbors. A fillet
  cylinder may need its tangent planes explicitly selected; unintended propagation
  into unselected faces is rejected. Other selected surface classes and offsets
  that split/collapse a body remain unsupported in this increment.
  111 native/model tests, build and TypeScript pass. Headless Chromium/WebKit and
  hidden Electron cover the actual modeling route, drag and typed input, error
  recovery, multi-face offset, reselection, history/archive and face sketching.
  Adjacent edge finishing/selection/Move/extrusion/Boolean/camera checks pass in
  Chromium. Biome has only the existing reviewed Move file-size warning.
  Next review: use the face-offset controls on actual bodies before another tool.

- **Required tangent-chain selection accepted (2026-09-15):**
  Fillet and Chamfer now expand seed edges to their OCCT-required tangent contours
  when the tool opens. Expanded edges stay visibly selected over the preview;
  sharp neighbors and unrelated chains are not added. Selection discovery makes
  no geometry/history edit, direct dragging continues through discovery, and
  cancellation retains the expanded selection. Acceptance remains one Undo.
  Native/model tests cover split circular rims, both modes, seed order and multiple
  bodies. Headless Chromium/WebKit and hidden Electron verify a rounded rectangle's
  straight/arc/straight chain through entry, preview, drag, cancel and Undo.
  All 107 native/model tests, build and TypeScript pass. Existing Fillet/Chamfer
  and adjacent selection/Move/extrusion/Boolean/face-entry/camera regressions pass
  in Chromium. Biome retains only the preexisting Move file-size warning.
  Founder accepted this increment and authorized face offset.

- **Legal edge sizes and Chamfer accepted with chain follow-up (2026-09-15):**
  Founder requested constrained legal values instead of invalid numeric overshoot
  and a separate Chamfer button. Both now share a concrete edge-editing interaction;
  Fillet uses radius, Chamfer equal setbacks on adjacent faces. Native OCCT verifies
  requested sizes; a bounded feasibility search constrains overshoot and reports
  the applied size. Verified limits are reused for the fixed document/selection.
  Pointer reversal responds immediately. Zero makes no edit; negative sizes become
  zero. Ineligible selections still report errors. The follow-up above supersedes
  the original requirement to select every tangent-chain edge manually.
  Preview acceptance/cancellation, one Undo, topology IDs and body order remain intact.
  107 native/model tests pass. Chromium/WebKit/hidden Electron cover both buttons,
  typed/drag limits, immediate reversal, zero, circular rims, history, Save/Open and
  surviving-face sketch entry. Adjacent edge/Move/Boolean/extrude/face-entry/camera
  checks pass in all three runtimes. Build and TypeScript pass; Biome retains only
  the existing reviewed 301-line Move controller warning.
  Founder accepted this direction and requested automatic required-chain selection.

- **Initial shared-radius fillet delivered (2026-09-15):**
  Exact convex/concave/meeting/circular edge fillets, local radius preview,
  acceptance/cancellation, stable IDs, Undo/reopen and surviving-face sketch entry
  were verified. Founder corrected illegal-number behavior and requested Chamfer;
  the current behavior above supersedes the original rejection/no-clamping policy.

- **Circular-edge follow-up accepted (2026-09-15):**
  Edge selection/highlights were accepted; founder requested complete circular
  rims as single edges. New extrusions preserve full circles and contiguous
  partial arcs, producing one cylindrical wall per circular boundary. Periodic
  seams remain in exact topology but are hidden from display, picking and snaps.
  Existing bodies are not rebuilt. 101 native/model tests pass, including annuli,
  both extrusion signs on all coordinate planes and major/minor circular regions.
  Chromium/WebKit/hidden Electron verify opposite rim picks resolve to one ID
  and front-facing seams select the wall; screenshots confirm no seam outline.
  Boolean, face-sketch, archive and camera regressions pass in all three runtimes.
  Build/TypeScript pass; lint retains only the existing Move-controller size warning.
  Founder accepted this follow-up and authorized the shared-radius 3D fillet tool.

- **Body edge selection/boundaries accepted (2026-09-15):**
  Review feedback: selected/hovered edge highlights are bold 4-pixel overlays
  visible through bodies; rendered-pixel checks pass in all three UI environments.
  Visible body edges hover and select independently of bodies/faces, with Shift
  add and Cmd/Ctrl toggle. Picking rejects edges behind other faces/bodies.
  Pure face selection offers local Select boundary edges: hole loops survive;
  shared interior edges and periodic seams are excluded. A closed shell has no
  boundary. Native face-wire occurrences map to stable document edge IDs; opening
  existing archives regenerates them from exact BRep. Selection creates no edits
  or Undo steps. 99 native/model tests cover annular/disjoint/adjacent face sets,
  multiple bodies, a real periodic cylinder seam and old-archive regeneration.
  Chromium/WebKit/hidden Electron pointer routes cover straight/curved edge hits,
  hover, toggling, hidden/rear edges, hole/adjacent boundaries and unchanged Undo.
  Move/Boolean/extrude/face-sketch/camera regressions pass. TypeScript/build pass;
  Biome has only the existing reviewed 301-line Move controller warning.
  Founder accepted edge selection; circular topology follow-up is recorded above.


