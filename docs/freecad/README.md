# FreeCAD knowledge compendium

For the 2026-09-14 reset, use the [development process](../development-process.md)
and [sketch-first design](../architecture.md) as architectural authority. These
chapters retain earlier Freac inferences and prototype evidence; prescriptions
for model revisions, idempotent commands or a service graph are not requirements
of the new single-user editor. Reuse concrete numerical and interaction lessons.

An initial targeted source audit for agents building Freac. The objective is to
retain FreeCAD's accumulated engineering lessons while choosing our own product
model and UI. This is a reference library, not a claim of exhaustive coverage or
a recommendation to copy the entire FreeCAD architecture.

## Read by task

| If implementing… | Read | Main lessons |
| --- | --- | --- |
| Documents, commands, save, undo, deletion | [Document/history](document-history.md) | Identity lifetimes; graph ordering; staged restore; transaction/deletion semantics |
| Sketch constraints, dragging, trim, solver extraction | [Sketch/solver](sketch-solver.md) | Diagnosis and initialization; curve/constraint rewrites; restore synchronization |
| OCCT operations, topology, meshes, packaging | [Kernel/topology](kernel-topology.md) | Shape comparison; element history; validation/tolerances; tessellation and interchange |
| Viewport, navigator, selection, focus, lifecycle | [GUI/interaction](gui-interaction.md) | Context before cleanup; gesture ownership; queued notifications; deletion invalidation |

Before implementation, read the applicable chapter and its source references.
Each chapter distinguishes inspected mechanisms from Freac implications and
unverified failure probes. Current founder instructions and Freac's [architecture topic docs](../architecture.md)
define intended behavior; upstream implementation does not override them.

## Most consequential lessons

1. A stable object ID does not solve evolving face/edge identity. Preserve
   provenance and distinguish semantic references from current render indexes.
2. Solving equations is only part of sketching. Diagnosis, initial state,
   redundancy handling, curve mutation, constraints and undo must agree.
3. Trim rewrites constraints and identity as well as visible curve spans.
4. Load/restore is graph reconstruction and repair. It needs a publication
   boundary just as modeling commands do.
5. Cleanup can mutate selection or delete its own target. Capture the next
   interaction intent before retiring the old session.
6. The drag owner must retain the whole gesture. Selection and tool hover cannot
   be independent competitors for the release event.
7. Kernel validation, repair, comparison, serialization and history are distinct
   services. A successful operation call alone proves little about product intent.
8. Packaging includes coherent versions, resources and behavior changes between
   kernels. An independent executable gives control but transfers maintenance.

See chapter citations for evidence; these summaries are not standalone API contracts.

## Provenance and reproducibility

- Upstream: https://github.com/FreeCAD/FreeCAD
- Inspected commit: `78e4038a564e4c8bfebb40119b41d67531232223`.
- Commit timestamp: `2026-09-13T12:13:34Z`; title:
  `TechDraw: Fix incorrect ASME diameter dimension format (#32439) (#32492)`.
- Audit date: 2026-09-13. This is an upstream development snapshot, not evidence
  about the version loaded by the user's earlier FreeCAD installation.
- Local reference: `.reference/FreeCAD`, approximately 116 MB at initial capture.
  It is a shallow sparse checkout, ignored by Freac; no upstream source is vendored
  in this repository's commit. Individual additional test files may be hydrated
  on demand. Follow immutable GitHub links without needing the checkout.
- Method: three bounded Luna source audits, manager GUI source audit, review and
  corrections, cited-path/line-range checks, and selected mechanism/test inspection.
  No upstream compilation, native test execution, benchmark or full license audit.

To reconstruct a local reference, fetch the exact revision rather than silently
updating this evidence to a later main branch:

```sh
git init .reference/FreeCAD
git -C .reference/FreeCAD remote add origin https://github.com/FreeCAD/FreeCAD.git
git -C .reference/FreeCAD config remote.origin.promisor true
git -C .reference/FreeCAD config remote.origin.partialclonefilter blob:none
git -C .reference/FreeCAD fetch --depth 1 --filter=blob:none origin 78e4038a564e4c8bfebb40119b41d67531232223
git -C .reference/FreeCAD sparse-checkout init --cone
git -C .reference/FreeCAD sparse-checkout set src/App src/Base src/Gui src/Mod/Sketcher/App src/Mod/Sketcher/SketcherTests src/Mod/Part/App src/Mod/Part/parttests src/Mod/PartDesign/App tests/src cMake .github/workflows
git -C .reference/FreeCAD checkout --detach FETCH_HEAD
```

Run that only when the reference directory does not already exist. Do not run
upstream scripts merely because a source comment suggests them. Audit prose is
original; extracting actual code requires separate provenance/license assessment.

## Coverage limits and next audits

| Area | Current coverage | Follow-up |
| --- | --- | --- |
| App document graph/transactions/restore | Targeted implementation and tests | Project-file corruption, crash recovery, cross-document cycles, async recompute |
| Sketcher/GCS | Integration, initialization/diagnosis, trim/split, selected tests | Standalone build boundary, solver algorithm stress cases, units/expression handling |
| Part/OCCT | Shape wrappers, mapped Boolean path, fillet binding, mesh API | Deep generated/modified/deleted mapping internals, healing and tolerance stress cases |
| Import/export | Basic shape STEP/IGES paths and version-specific export handling | XCAF metadata, units, assemblies, round-trip losses |
| GUI | Entry/reset, selection notifications, deletion, drag arbitration | Spatial rendering quality, IME/accessibility, platform focus, touch/Pencil |
| Build/distribution | CMake module boundary and pixi dependency constraints | Reproducible Freac builds, install/signing/updating, license review |
| PartDesign | Only shallow module/feature-boundary context | Body/Tip, supports, attachments, transformed/nested coordinate contexts |
| Other workbenches | Not audited | Audit only when a Freac feature needs them |

Earlier proof plans are preserved in [Git history](../history/README.md#retired-prototype).
Use the current user request and architecture to select additional audits.

## Updating this knowledge

For each new finding, record: upstream revision; path/function and precise source
link; mechanism or regression; Freac implication; failure probe; evidence actually
run; and what remains uncertain. Cite an upstream regression test when available,
but inspect what it asserts rather than relying on its name. Preserve old evidence
when a newer source changes behavior. Do not mark an audited topic implemented.
