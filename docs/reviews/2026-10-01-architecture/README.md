# Makeshift architecture assessment

Makeshift's main architectural decisions are in the right layers. Keep the single TypeScript document owner, snapshot Undo, materialized exact bodies, stateless native calculators, typed edits and shared browser frontend. The next work should repair a few concrete boundary defects and consolidate repeated lifecycle decisions. A repository rewrite or new service framework would add cost without resolving those defects.

This review covers baseline `59bc72668a33fba550c7d8ba14b8bb3ab28abe2a` on 2026-10-01. Five GPT-6.1 Sol agents at High reasoning reviewed six areas, with one agent taking a second assignment. The primary agent cross-checked shared findings, ran baseline checks and prioritized the combined result. These are recommendations; application code and accepted interaction contracts have not changed.

## Responsibilities to preserve

| Responsibility | Appropriate owner | Current assessment |
| --- | --- | --- |
| Accepted geometry, candidate publication and history | DocumentOwner and DocumentStore | Correct overall; cancellation and validation need one final publication boundary. |
| Pointer intent, tool parameters and ordered selection | Editor and concrete interaction controllers | Correct overall; pending gesture lifetime and transition policy are repeated. |
| Curve and exact solid calculations | Shared geometry helpers, PlaneGCS and OCCT adapters | Calculators remain stateless; native contracts and numerical policies need tightening. |
| Meshes, highlights, picking and temporary display | World and view modules | Exact geometry remains authoritative; invalidation currently mixes geometry with styling. |
| Files, agent processes and active desktop or iPad surface | DocumentSession and host adapters | Mostly well separated; replacement and shutdown can bypass their intended lifecycle. |

The dependency direction should remain straightforward: input produces typed intent; the owner computes, validates and publishes accepted data; views derive presentation from accepted data or the current temporary candidate. Host adapters provide files, transports and process lifetime. Current module boundaries can express this without extracting packages.

The code supports several important contracts worth retaining. Extrusion release leaves a temporary candidate until completion. Point targets remain distinct from whole curves and rendering owners. Region boundaries derive analytically from curves. Native predecessor correspondence becomes stable IDs only in TypeScript materialization, with new IDs for splits and merges. Saved BReps regenerate presentation on Open; sketch edits do not replay body recipes. Shared rendering imports no Electron APIs in the inspected paths. Three.js math in a shared geometric helper is not itself a host leak.

## Correctness priorities

P1 means fix in the next correctness increment. P2 means a bounded defect or substantive risk to address in the following increments. P3 means maintainability or optimization that should follow supporting measurements. Confidence describes evidence, not user frequency.

| Order | Finding and impact | Evidence | Smallest useful correction |
| --- | --- | --- | --- |
| 1, P1 | Cancel can still publish an automatic edit after native calculation completes. | Real native transform and deletion paths reproduced with a controlled delay before publication. | Check cancellation after awaited postprocessing and immediately before automatic publication. Preserve noncancellable explicit Accept. |
| 2, P2 | Transform handoff can replay a press after pointer cancellation, blur or disposal. | Actual handoff helper reproduced in Chromium and WebKit with delayed completion. | Give the pending press its own bounded lifetime, cancellation state and continuation check. |
| 3, P2 | Preview queue invalidation can drop a decoration that the worker then considers already rendered. | Actual queue probe with a fake worker, plus direct inspection of worker memoization. Full worker reproduction outstanding. | Deliver only still-valid per-instance results, or reset worker memoization when output is discarded. |
| 4, P2 | A naturally exited harness can leave a background writer running after Stop. | Bounded macOS Custom shell probe reproduced continued writes after root exit and Stop. | Retain safe OS session cleanup ownership independently of the live PTY, covering natural exit. |
| 5, P2 | Model-only Save can emit bytes that Open refuses. | Codec probe wrote a valid padded envelope above 72 MiB; its reader rejected it. | Enforce the existing size policy before both archive writer branches and preserve save identity on rejection. |
| 6, P2 | Normal edits can accept document IDs that Open rejects. | A construction plane and sketch with the same ID were accepted; whole-document validation rejected that state. | Run shared document invariants at publication, without invoking the kernel again for every edit. |
| 7, P2 | Host model transport exposes raw New/Open outside the file and workspace lifecycle. | Source trace through desktop/iPad adapters and DocumentSession; normal UI uses the proper file-command route. | Reserve host document replacement for DocumentSession commands and narrow the model adapter's authority. |

The first finding is a publication issue, not a failure of native termination. [DocumentOwner.cancelPreview](https://github.com/osuushi/makeshift/blob/59bc72668a33fba550c7d8ba14b8bb3ab28abe2a/src/backend/document-owner.ts#L133-L160) waits for the active operation while automatic acceptance still has a path to `store.accept`. Script steps already check cancellation after awaited stages. Reuse that simple principle rather than adding revisions, replay or request ledgers. The controlled probe establishes owner behavior; ordinary UI frequency remains unmeasured.

The handoff finding concerns the interval before the new interaction acquires its lease. [Transform handoff buffering](https://github.com/osuushi/makeshift/blob/59bc72668a33fba550c7d8ba14b8bb3ab28abe2a/src/model/transform-handoff.ts#L24-L68) and the corresponding Transform box path track move/up but not cancellation during their await. Ordinary lost-capture protection starts too late for that interval. Share this small input mechanism; concrete tools should still own their geometry and completion semantics.

The preview finding is a disagreement between computed and delivered results. [PreviewQueue](https://github.com/osuushi/makeshift/blob/59bc72668a33fba550c7d8ba14b8bb3ab28abe2a/src/decorators/preview-queue.ts#L55-L95) drops an obsolete whole response while retaining a worker whose per-instance cache has already advanced. An unchanged decoration can therefore disappear from subsequent output. The rendering lane ranks this P1; the consolidated ranking is P2 because the demonstrated queue problem affects derived display, and complete worker/UI reproduction is still outstanding. Source replacement and disablement must continue to invalidate their results.

The host findings share a principle: geometry ownership does not replace document-session ownership. Process shutdown must finish before final workspace capture; accepted save limits must agree with Open; replacement must coordinate geometry, file path, workspace and agent binding. The existing safe-write and prepared-open paths already provide useful boundaries. Repair their bypasses rather than introducing another lifecycle manager.

## Refactors with clear current value

**Separate geometry lifetime from body styling.** [bodyView.update](https://github.com/osuushi/makeshift/blob/59bc72668a33fba550c7d8ba14b8bb3ab28abe2a/src/model/body-view.ts#L57-L104) clears and rebuilds all visible face geometry when hover or selection changes, including vertex welding and normal computation. Keep drawables for unchanged source objects and update materials, visibility and edge overlays separately. Camera-only changes already avoid most rebuilds, and disposal is present, so this is neither a proven leak nor an unconditional per-frame rebuild. Instrument geometry construction and resource counts before claiming a latency gain.

**Make native contracts match the actual wire data.** `SolidCalculator` presents operation and query replies as one `KernelResult`, although native query branches have different shapes and Inspect uses a mode outside the declared BooleanMode. `NativeCalculator` parses and casts JSON. Use concrete reply types and adapter checks for structural, finite-coordinate and correspondence invariants. Keep geometric feasibility in the kernel. Also apply the exact-body envelope already used by sweeps to other native calls: ordinary previews currently stringify full display bodies that native operand loading does not consume. This removes known redundant bytes; its speed benefit is unmeasured. See [the geometry review](03-geometry-native.md).

**Unify transition decisions before extracting preview scheduling.** Workspace entry, navigation and tool completion currently interpret several independent lists of interaction kinds. Scale's canvas blocker is counterevidence against treating a missing entry in one list as a proven bug, but listener order and alternate entry routes still deserve a behavior matrix. Put the workspace transition decision in one editor entry point. Then extract the existing one-running/one-latest preview scheduling mechanism for Extrude and Face Offset first. Preserve their different interruption, last-valid-result and tool-completion behavior. A universal tool engine would erase meaningful differences.

**Extract lower-level identity and point queries when touching those dependencies.** `document.ts` combines model types, ID creation and geometric validation; geometry imports its runtime ID function while validation imports geometry. Point coordinate queries also come through picking/point-selection modules that depend on Transform presentation. These are real source dependency cycles, not observed initialization failures. Moving identity creation, validation entry points and model-space point enumeration to coherent leaf modules would let algorithms depend on data rather than UI-shaped helpers. Avoid a wholesale `src/model` or `src/sketch` move: functional grouping is not itself a layer violation. Type-only imports must not be counted as runtime cycles.

**Name numerical policies by units and purpose.** Boundary distance, topology tolerance, approximation error, orientation and degenerate-volume floors differ for legitimate reasons. Document those roles and share constants only where semantics match. Small-body reconnection thresholds merit an actual geometry case before changing them. Do not collapse every epsilon into one global number or introduce a general precision framework.

**Make test selection fail visibly.** Some standalone UI harnesses silently execute zero routes for an unsupported `MAKESHIFT_TEST_BROWSER`; the main UI suite validates it. A small shared runtime selector and owned launcher can remove this inconsistency and setup duplication. Also distinguish the supported adapted OCCT SDK from a stock SDK: the `OCCT_ROOT` route bypasses Makeshift's pinned source adaptation while current setup documentation advertises the same version alone. This is a provenance/parity gap, not a reproduced stock-SDK geometry regression. See [maintainability and verification](06-maintainability-tests.md).

**Reconcile the model topic with delivered code.** [The model document](../../architecture/model.md) still lists ellipse/elliptical arc in its V1 curve set and describes selectable regions and model operations as deferred S3 work. The current `Curve` union is segment/circle/arc/cubic Bézier, and profiles and solid operations are implemented. These stale statements weaken the entry point for a future refactor. Update the existing topic to distinguish delivered behavior from proposals; this assessment does not adopt the older implementation order.

## Product questions to settle before changing behavior

Two mismatches require a concrete interaction decision during implementation. Manual sweep selection currently requires aligned normals; backend profile input accepts antiparallel normals. Decide whether sweep direction follows the first source across oppositely oriented supports, then use the same predicate in both paths. Do not silently broaden manual applicability merely to match the backend.

Computer Close/Quit during iPad control currently stops the remote connection and discards a released operation before the normal file-command completion route. iPad-initiated Close follows completion. The persistence contract says intentional Close completes a released tool; the disconnect contract says unfinished previews are discarded. Reconcile deliberate computer Close with those contracts, then verify Save/Cancel and failed completion through the active surface. Unexpected disconnect and Return to computer should retain their existing semantics unless explicitly changed. This finding remains a source trace; physical iPad acceptance did not run.

## Suggested implementation sequence

Each increment should end with a usable interaction checkpoint and a coherent commit. The following is sequencing advice, not authorization to begin implementation from this review.

1. **Document publication:** fix cancellation before automatic commit, then apply common accepted-document validation. Cover transform/deletion/Open, cancellation at native and postprocessing stages, Redo preservation, explicit Accept and subsequent editing.
2. **Gesture and decoration delivery:** fix pending Transform handoff lifetime and the queue/worker completion mismatch. Exercise actual controls under delayed delivery, Cancel/Escape, focus loss, disposal and two independent decorations. Verify Chromium/WebKit and hidden Electron as appropriate.
3. **Host lifecycle and file round trips:** handle natural-exit child cleanup, archive limits and raw replacement requests. Verify Custom harness exit followed by New/Open/Close with Save, safe-write failure and old-agent revocation. Resolve deliberate remote Close at this checkpoint.
4. **Native boundary:** introduce exact-body request envelopes and truthful concrete reply contracts, preserving geometry and stable IDs. Run representative captured offset, shell, Boolean, transform, query and reopen paths. Settle sweep-normal semantics before sharing its predicate.
5. **Rendering and interaction maintainability:** separate body drawable/style invalidation, centralize workspace transitions, then extract only the repeated preview scheduler. Measure before further picking, signature or compositing optimization.
6. **Dependency and verification cleanup:** extract the small identity/point-query seams as affected files change; unify runtime selection; reconcile SDK provenance and stale topic statements. Avoid a standalone repository reorganization project.

The first three groups fix correctness. The later groups should follow those fixes, because changing scheduling, view caching or native contracts while lifetime behavior is unresolved would make failures harder to diagnose. Effort for an individual refactor should be estimated from its acceptance matrix; this review does not establish a reliable total implementation duration.

## Verification and limits

The primary activated Node 24.15.0 through `.nvmrc` before Node commands and ran:

- `npm run typecheck`: passed for shared, host and test configurations.
- `npm run check`: passed with four warnings. Source warnings are `editor.ts` at 303 lines, `body-edge-finish-controls.ts` at 308 lines and `DocumentOwner.dispatch` at 83 lint-counted lines. Biome also skipped a 1.8 MiB fixture above its 1 MiB limit. These warrant responsibility review, not mechanical splits or suppressed warnings.
- `npm test`: 589 of 590 passed in the sandbox; the PTY termination test failed because process enumeration was denied. Both tests in its file then passed with process access. No product assertion failure remained from this run.
- `node tests/focus-loss-ui.mjs`: Chromium and WebKit passed. The first Electron launch timed out before host output existed; after compiling the host, `MAKESHIFT_TEST_BROWSER=electron node tests/focus-loss-ui.mjs` passed. This route exercised released extrusion, sketch/body placement, numeric entry, held-drag cancellation and history with real geometry. Browser blur was dispatched synthetically.
- `npm run build`: passed, including native calculators, production renderer/workers and host output. Vite reported large chunks and externalized `node:module` imports from Manifold; successful build is not evidence that every production worker path ran.

Agent probes additionally established the publication race, duplicate-ID acceptance, handoff replay, natural-exit background writer and archive byte mismatch. The queue probe used a fake Worker; no complete preview-worker reproduction ran. Browser and Electron checks used owned headless/hidden instances. Their processes and profiles were closed.

The full UI suite, every decorator shader/export path, physical iPad/Pencil behavior, authenticated harness use, fresh dependency setup and Windows/Linux builds were not verified in this review. Performance costs described above are source-observed work, not benchmarks. The baseline suite passes do not cover the newly identified interleavings.

## Detailed reports

| Area | Report |
| --- | --- |
| Accepted data, cancellation, history and solver integration | [Document ownership](01-document-ownership.md) |
| Pointer tools, selection and transition policy | [Interaction layers](02-interaction-layers.md) |
| Exact solids, native contracts and numerical policy | [Geometry and native calculators](03-geometry-native.md) |
| Drawing, picking, invalidation and decoration preview | [Rendering layers](04-rendering-layers.md) |
| Files, harnesses, transports and document session | [Host agent and persistence](05-host-agent-persistence.md) |
| Dependency direction, setup and verification architecture | [Maintainability and tests](06-maintainability-tests.md) |
