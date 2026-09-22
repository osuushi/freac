# FreeCAD document audit (pinned `78e4038a564e4c8bfebb40119b41d67531232223`)

Freac's [body recipe validation](https://github.com/osuushi/freac/blob/3a4615641204f3a90683c590f52bfe3f81b29f87/docs/evidence/body-recipe-validation.md) now checks
both per-snapshot dependency ownership and cross-history recipe identity. A
changed-target regression fixture initially left an orphan operation, so it
could fail for the wrong reason. Both snapshots now pass independently before
their combined history rejects the changed target. This is independent Freac
evidence; the upstream revision and source findings below are unchanged.

Freac's independent [body identity helper](https://github.com/osuushi/freac/blob/3a4615641204f3a90683c590f52bfe3f81b29f87/docs/evidence/body-registry.md) separates
immutable creation identity from the current result producer. Legacy migration
must accept the same operation in multiple history snapshots while rejecting
duplicates within one snapshot; one global mapping preserves identity across
them. Subsequent native document/v8 archive checks retain that identity through
fresh-process restore and executable history. Review also found that reusing an
Undo command ID with new revision metadata correctly produces an idempotency
conflict; that test failure was not geometry drift. These are independent Freac
findings, not upstream runtime evidence. The inspected upstream revision is unchanged.

Freac's [public face-workspace command proof](https://github.com/osuushi/freac/blob/3a4615641204f3a90683c590f52bfe3f81b29f87/docs/evidence/face-workspace-commands.md)
now separates a transient revision-qualified face pick from the stored attachment
triple. Replacing a producer capture rejects when it would invalidate an attached
workspace; producer dimension changes and face offsets instead move the supported
geometry while retaining local drawing. This is independent Freac runtime
evidence, not a new upstream source claim. Face-supported archive persistence and
ordinary UI entry remain pending; the pinned inspection revision is unchanged.

The subsequent [v7 archive proof](https://github.com/osuushi/freac/blob/3a4615641204f3a90683c590f52bfe3f81b29f87/docs/evidence/face-workspace-persistence.md)
retains document-local attachment triples across fresh-process restore and
reissues transient references for every returned workspace. Checking only a
later query would miss stale region references in the restore result itself.
The proof also separates geometric validity from historical intent: a retargeted
workspace with consistent replacement geometry still fails its historical
ID-to-support invariant. These are independent Freac findings; ordinary UI
reopening and general crash recovery remain unverified.

Freac's subsequent [rectangle dimension proof](https://github.com/osuushi/freac/blob/3a4615641204f3a90683c590f52bfe3f81b29f87/docs/evidence/p1d-dimensions.md)
separates captured boundary membership from evaluated source dimensions. Full
captures rebuild from their original four sources when dimensions change;
appended crossing lines do not enter those captures. Affected partial captures
reject atomically until intersection intent is represented. This is independent
Freac runtime evidence, not an additional claim about the pinned FreeCAD code.

Scope: source inspection of `src/App/Document.{h,cpp}`, `DocumentObject`, `PropertyLinks`, `Transactions`, plus two upstream tests. This is an audit for Freac’s independent three.js client and authoritative local/remote OCCT service; no FreeCAD build or runtime test was performed.

## Findings and design lessons

1. **There are several identities, with different lifetimes.** A document has a persistent UUID (`Uid`) in its property set ([Document.h L168-L170](https://github.com/FreeCAD/FreeCAD/blob/78e4038a564e4c8bfebb40119b41d67531232223/src/App/Document.h#L168-L170)); newly added objects receive incremented integer IDs in the current document and are indexed in `objectIdMap`, while the internal name is a unique map key and the label is presentation ([Document.cpp L3427-L3468](https://github.com/FreeCAD/FreeCAD/blob/78e4038a564e4c8bfebb40119b41d67531232223/src/App/Document.cpp#L3427-L3468)). `containsObject` validates both ID and pointer ([Document.cpp L3501-L3507](https://github.com/FreeCAD/FreeCAD/blob/78e4038a564e4c8bfebb40119b41d67531232223/src/App/Document.cpp#L3501-L3507)); restoration/import can reconstruct names and IDs, so this is not a global or eternal identity guarantee. Lesson: Freac should issue an immutable model/object identity in its own protocol and keep names/labels separate. Do not claim a UUID solves geometric subelement identity: FreeCAD’s object ID says nothing about faces/edges, and object IDs are only unique within an owner document.

2. **The property graph is explicit and richer than object adjacency.** `PropertyLink` variants maintain InList/OutList back-links; dependency edges can retain both source/target object and the relevant property ([DocumentObject.h L497-L535](https://github.com/FreeCAD/FreeCAD/blob/78e4038a564e4c8bfebb40119b41d67531232223/src/App/DocumentObject.h#L497-L535), [DocumentObject.h L594-L610](https://github.com/FreeCAD/FreeCAD/blob/78e4038a564e4c8bfebb40119b41d67531232223/src/App/DocumentObject.h#L594-L610)). The graph has options excluding expressions, hidden links, or cross-document links. Lesson: Freac’s authoritative service should persist typed dependency edges, including the property/operation that caused a dependency; client scene objects should be projections of that graph.

3. **Recompute is a guarded, dependency-ordered execution, not an automatic immutable update.** `Document::recompute` rejects undo/rollback, partial documents, recursive invocation, and (unless forced) SkipRecompute ([Document.cpp L2855-L2904](https://github.com/FreeCAD/FreeCAD/blob/78e4038a564e4c8bfebb40119b41d67531232223/src/App/Document.cpp#L2855-L2904)). It obtains a dependency-sorted list and marks PendingRecompute, then executes up to two passes ([Document.cpp L2927-L2955](https://github.com/FreeCAD/FreeCAD/blob/78e4038a564e4c8bfebb40119b41d67531232223/src/App/Document.cpp#L2927-L2955)). A source failure filters dependent objects; it does not promise an all-or-nothing graph transaction. Lesson: Freac should make recompute results/version and failures explicit, and should define whether failed downstream nodes retain last valid geometry or become invalid. In the growing planar workspace, an append command should add profile geometry only; a separate explicit extrusion operation can consume it, while old extrusion boundaries remain unchanged unless deliberately revised.

4. **Transactions are application-coordinated and can span documents.** Opening refuses nested/performed transactions and clears redo history when a new transaction is created ([Document.cpp L361-L430](https://github.com/FreeCAD/FreeCAD/blob/78e4038a564e4c8bfebb40119b41d67531232223/src/App/Document.cpp#L361-L430)). Commit places the transaction on the undo stack and can notify the application to commit matching IDs in other documents ([Document.cpp L573-L637](https://github.com/FreeCAD/FreeCAD/blob/78e4038a564e4c8bfebb40119b41d67531232223/src/App/Document.cpp#L573-L637)); abort applies recorded changes in rollback mode ([Document.cpp L640-L675](https://github.com/FreeCAD/FreeCAD/blob/78e4038a564e4c8bfebb40119b41d67531232223/src/App/Document.cpp#L640-L675)). Lesson: Freac needs a single authoritative command/version boundary across client and OCCT worker, with idempotent command IDs and explicit commit/abort outcomes. Do not copy the implicit auto-transaction behavior.

5. **Undo records object/property mutations, but deletion has pointer-lifetime traps.** Removal marks the object, calls `unsetupObject`, signals deletion, breaks all links, removes it from ID/name/array indexes, and records a “new object” for undo when an active transaction exists ([Document.cpp L3541-L3610](https://github.com/FreeCAD/FreeCAD/blob/78e4038a564e4c8bfebb40119b41d67531232223/src/App/Document.cpp#L3541-L3610)). Outside an undo transaction, the object can be destroyed and its cached name pointer nulled ([Document.cpp L3612-L3637](https://github.com/FreeCAD/FreeCAD/blob/78e4038a564e4c8bfebb40119b41d67531232223/src/App/Document.cpp#L3612-L3637)). Lesson: Freac protocol commands must not retain raw object pointers across lifetimes; use durable IDs and an explicit deletion/restore representation. Deleting a source must explicitly define dependent operation behavior (invalid, detached, or cascading), rather than silently nulling links.

6. **Persistence is a staged restore with deferred link repair.** Save calls every object’s `beforeSave`, writes document properties and objects, and includes a string-hasher table ([Document.cpp L1115-L1149](https://github.com/FreeCAD/FreeCAD/blob/78e4038a564e4c8bfebb40119b41d67531232223/src/App/Document.cpp#L1115-L1149)). Restore clears the live object indexes and reconstructs them from the archive ([Document.cpp L2143-L2205](https://github.com/FreeCAD/FreeCAD/blob/78e4038a564e4c8bfebb40119b41d67531232223/src/App/Document.cpp#L2143-L2205)). `afterRestore` deliberately invokes property repair after all objects exist and explicitly says dependency order is not ready yet ([Document.cpp L2235-L2265](https://github.com/FreeCAD/FreeCAD/blob/78e4038a564e4c8bfebb40119b41d67531232223/src/App/Document.cpp#L2235-L2265)). Lesson: Freac’s save format should be snapshot/version based, load into an isolated candidate graph, repair references, validate/recompute, then atomically publish. A partially restored graph must not be presented as authoritative.

7. **Name/label based subelement links are migration machinery, not stable topology identity.** Import/export rewrites object names and labels with document-qualified strings and restores label references later ([PropertyLinks.h L510-L554](https://github.com/FreeCAD/FreeCAD/blob/78e4038a564e4c8bfebb40119b41d67531232223/src/App/PropertyLinks.h#L510-L554)). This is useful for copy/paste but makes labels mutable and topology names version-sensitive. Freac should model face/edge references as operation-owned semantic anchors (for example, sketch region plus boundary signature) and run explicit remapping after OCCT changes; never advertise object IDs or serialized names as topological guarantees.

## Relevant upstream tests

- `DocumentTest.importObjectsRestoresSourceStringHasher` saves a source document, imports it into another document, and asserts the persisted string-hasher table is restored ([tests/src/App/Document.cpp L101-L135](https://github.com/FreeCAD/FreeCAD/blob/78e4038a564e4c8bfebb40119b41d67531232223/tests/src/App/Document.cpp#L101-L135)). This is direct evidence that import has post-load state beyond object/property XML.
- `ProjectFileTest` covers invalid-file rejection, document loading, metadata including UUID, object enumeration/type lookup, and restoring an object ([tests/src/App/ProjectFile.cpp L43-L112](https://github.com/FreeCAD/FreeCAD/blob/78e4038a564e4c8bfebb40119b41d67531232223/tests/src/App/ProjectFile.cpp#L43-L112)). It is useful coverage for snapshot readers, but does not establish atomic recovery after interruption.
- `DocumentObjectTest.getSubObjectList` resolves nested names such as `Fusion.Box.Edge1`, reports the participating object IDs, and distinguishes flattened versus hierarchical traversal ([tests/src/App/DocumentObject.cpp L44-L56](https://github.com/FreeCAD/FreeCAD/blob/78e4038a564e4c8bfebb40119b41d67531232223/tests/src/App/DocumentObject.cpp#L44-L56), [tests/src/App/DocumentObject.cpp L113-L155](https://github.com/FreeCAD/FreeCAD/blob/78e4038a564e4c8bfebb40119b41d67531232223/tests/src/App/DocumentObject.cpp#L113-L155)). This demonstrates that subobject paths are resolved through document structure, not a standalone stable topology key.
- `LinkTest` checks link transform/scale property behavior and synchronization ([tests/src/App/Link.cpp L184-L216](https://github.com/FreeCAD/FreeCAD/blob/78e4038a564e4c8bfebb40119b41d67531232223/tests/src/App/Link.cpp#L184-L216), [tests/src/App/Link.cpp L321-L339](https://github.com/FreeCAD/FreeCAD/blob/78e4038a564e4c8bfebb40119b41d67531232223/tests/src/App/Link.cpp#L321-L339)). This supports testing typed link semantics separately from geometric result validity.

## Unverified questions and failure probes

- Does a remote OCCT worker preserve command ordering and transaction IDs under reconnect? Probe: send append, revise-old-extrusion, append concurrently; reconnect between acknowledgements; assert one monotonic authoritative log.
- What semantic anchor survives face split/merge and shell healing? Probe: append a second planar profile, alter the first profile boundary, and verify only deliberately targeted extrusion changes; reject ambiguous remaps.
- What should client show for a failed downstream recompute? Probe: induce a self-intersection or zero-thickness result and verify last valid committed geometry remains visible with an explicit invalid operation.
- Can load/restore be interrupted safely? Probe: kill the service during snapshot validation and restart; assert the previous snapshot remains loadable and no half-restored graph is published.
- How are deletions represented across a client reconnect? Probe: delete a source with dependents, undo, then redo after a client reconnect; assert tombstone and dependency events are replayable without pointer assumptions.

## Independent P1b execution, 2026-09-13

The [native lifecycle proof](https://github.com/osuushi/freac/blob/3a4615641204f3a90683c590f52bfe3f81b29f87/docs/evidence/p1b-lifecycle.md) implements Freac's
bounded snapshot policy above the pinned components; it does not adopt or run
FreeCAD document services. Both 20×10 origin and 30×12 translated scenarios
preserve operation-owned exact boundaries and copied source definitions through
crossing append, explicit replacement, undo/redo and clear. Rejected candidates
preserve the complete queried content/revision/history. Actual solid properties
are remeasured, and accepted candidate views are prepared before publication.

This is runtime evidence for the earlier design inference that publication must
follow validation. A distinct finite segment at x=1e16 reaches support-envelope
validation and rejects while preserving the redo branch; an earlier identical-
endpoint test did not exercise that boundary and was replaced. Session/revision
checks apply to undo/redo too. The same callable dispatcher handles both author
labels and retains original retry outcomes alongside a current view.

Source IDs, definitions and parameter spans belong to the capture even after
workspace clear. Their vector order is not a durable geometric naming scheme.
A rejected global-overlap workaround showed why ambiguity must remain local to
the selected boundary; unrelated overlapping dangling lines cannot poison it.
The relevant component source links and raw reproduction are in the P0/P1
reports. Save/reopen, cross-process sessions, worker-crash containment, general
constraint/trim changes and ordinary editing-state behavior remain unverified
by this in-process history unit.

## Independent P1c execution, 2026-09-13

The [restore proof](https://github.com/osuushi/freac/blob/3a4615641204f3a90683c590f52bfe3f81b29f87/docs/evidence/p1c-restore.md) preserves the bounded document
and its undo/redo snapshots across fresh native processes. Both rectangle
fixtures reopen with the original document/object identities, copied source
definitions and measured operation properties. The restored redo entry actually
reapplies boundary replacement; clear is undone/redone after reopen, and new
drawing/extrusion preserves the old operations and avoids their source/object IDs.

Session identity is regenerated with checked Darwin `getentropy` output;
model revision advances beyond the saved and live revisions. Retry outcomes
remain session-local. Fifteen corrupt archives, including a valid translated
equal-volume solid with unchanged capture metadata, are rejected in a process
holding unrelated valid work. Complete public state and cached accepted/rejected
outcomes are compared after each failure. An output-stream failure also rejects.

Counterexamples affected both implementation and evidence: requiring captured
definitions to remain in the live drawing broke clear semantics; comparing only
history depths missed whether archived history was executable; changing a
similarly named field did not test a dangling span reference. The accepted
fixtures target the actual field and execute the actual restored transitions.

This implements Freac's bounded candidate-publication policy above OCCT, not
FreeCAD restore services. Host-native encoding, fixed XY/mm semantics, explicit
archive limits and duplicated snapshots are proof choices. Crash containment,
interrupted replacement, general topology repair, source-parameter propagation
and ordinary application editing state remain outside this result.

## Independent face-edit restore lesson, 2026-09-13

Freac commit `247d9ea` extends the bounded archive to face offsets and edited
history. A regression probe comparing the immediate restore response with the
next query found that newly added face references still carried the target's old
document/session while region references were refreshed. Publication now updates
every derived face reference before exposing the restored view. Checking only
top-level IDs or geometric volume would have missed this defect. Future derived
reference types need the same containing-view identity assertion. This is
runtime evidence from Freac, not a new observation about upstream FreeCAD; the
inspected upstream revision remains unchanged. Edited-history fresh-process and
malformed-offset probes are still pending; see the
handoff evidence (historical; `git show 2485a97:docs/evidence/face-edit-handoff.md`).
## Freac rectangle identity follow-up

Freac's native rectangle identity unit distinguishes a durable drawing entity
from its workspace and from revision-bound arrangement cells. Review caught a
migration draft that repaired counters for the new archive version as well as
legacy versions, masking malformed data. Migration must be version-specific;
validate the final migrated snapshot set before publishing it. Corruption tests
must isolate ownership errors from counter errors or they can pass for the wrong
reason. These are Freac implementation lessons, not new claims about upstream
FreeCAD. The inspected upstream revision remains unchanged; bounded runtime
coverage and legacy fixture limits are in
[rectangle identity evidence](https://github.com/osuushi/freac/blob/3a4615641204f3a90683c590f52bfe3f81b29f87/docs/evidence/rectangle-identity.md).

## Freac workspace provenance migration

The v6 capture-owner migration separates a capture's stored workspace from live
drawing membership, preserving the clear-workspace contract. Its review exposed
two misleading failure probes: duplicated live IDs masked wrong-owner rejection,
and the first undo snapshot had no capture to corrupt. Tests now isolate those
conditions. Format-version boundaries must remain explicit when the current
writer version advances. This is independent Freac implementation evidence;
the inspected upstream revision is unchanged. See the
[migration checks and limits](https://github.com/osuushi/freac/blob/3a4615641204f3a90683c590f52bfe3f81b29f87/docs/evidence/capture-workspace-migration.md).
