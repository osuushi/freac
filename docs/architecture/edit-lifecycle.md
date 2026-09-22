# Edit lifecycle and Undo

Read for work in this area, not on every resume. [Architecture index](../architecture.md).
Later founder decisions override earlier proposals.
Cubic editing/projection (2026-09-16) supersedes any earlier spline exclusion.

## One edit at a time

The entire mutation lifecycle is:

1. While idle, resolve the current selection and start an edit from accepted data.
2. Change a temporary candidate, solve when necessary and validate it.
3. On success, replace accepted data and add one Undo entry. On failure, retain
   the accepted document and display the relevant error locally.
4. Refresh derived geometry and controls, then accept the next edit.

While a calculation is running, disable conflicting edits, including Undo, Clear,
Open and tool changes that mutate geometry. Do not silently queue clicks or replay
them later. If it exceeds about 150 ms, show a busy indicator; that delay is an
initial UX default to test. The window continues repainting; pan/orbit/zoom remain
available except during a geometry drag gesture. Busy does not itself disable
navigation.
The delayed calculation indicator names the operation, shows elapsed time and
offers Cancel/Escape for cancellable calculations. Heavy native work
runs outside the renderer, using a direct call adapter and one request in flight.
There is no need to freeze the operating-system event loop to block editing.

For sketch dragging, the interaction owns one temporary candidate and one original state.
Pointer updates change that candidate, with at most one solver calculation running.
If computation cannot follow the pointer, retain only the latest pointer target
for this gesture, never a queue of intermediate edits. Show the last valid solved
candidate; do not advertise unverified snapped geometry as accepted geometry.
Release waits for the final target to be validated and makes one edit. Escape or
lost pointer capture before completion discards the gesture. An in-flight call
may finish, but a discarded gesture has no path to acceptance. This is ordinary
gesture ownership, not a document-version or retry protocol.

`ActiveInteraction` is the sole owner of the current edit's phase, displayed
candidate and pointer-capture cleanup. Pointer, rectangle bow, fillet, offset,
trim and numeric controllers acquire it; a second interaction cannot acquire it
until cleanup completes. Concrete controllers still own their geometry and
completion rules. `GestureSolve` publishes only into its owning interaction.
An invalid latest target clears its preview; a cancelled calculation cannot
restore one. Escape routes to the current owner. Window focus loss cancels only
a held pointer gesture (an interaction with pointer capture); released modal
previews, numeric edits and pending calculations survive app switches. Intentional
pointer release is distinguished from lost capture.

Numeric fields acquire an edit while focused. Tab transfers that ownership;
numeric entry during a held drag belongs to the existing pointer edit. Acceptance
and discard finish before ownership is released. Waiting for a final calculation
remains cancellable; an acceptance already sent to the backend completes normally.

This release-time acceptance applies to sketch edits, not to every tool. Extrusion
retains one candidate across successive drags/parameter edits until the user
completes and exits the tool. Its split bodies are temporary until then. Both
lifecycles use the same simple edit acceptance and Undo mechanism.

Unconstrained movement and transforms that preserve every existing constraint
exactly can run directly. Use the solver for coupled constrained edits; do not
duplicate a numerical constraint solver in TypeScript for preview. If measured
interaction latency is poor, optimize that calculation or
its adapter. Do not introduce optimistic document editing to conceal it.

No public revisions, expected-revision fields, idempotency keys, retry ledgers,
durable command envelopes, concurrent edits or automatic recovery/replay. A native
call returning an error leaves the last accepted TypeScript document available.
The five-minute native watchdog reports timeout separately from user cancellation. Cancellation
and timeout detach replies immediately, request termination, escalate to forced
termination after 250 ms, and drain process exit before the slot can be reused.
A request waiting for that drain can also be cancelled.
After a worker exit, finish the failed edit as a failure and explicitly restart
the calculator when needed; do not replay the failed edit automatically.

The future embedded agent calls the same edit functions through the app host.
It waits while the editor is busy or receives “busy.” Re-resolve referenced IDs
when an edit starts; missing geometry is an ordinary error. User and agent do not
write the document concurrently. Remote hosting, if later delivered, retains
single-user serialized semantics rather than introducing collaborative editing.

## Unified attempted-operation history (founder decision, 2026-09-17)

DocumentStore owns one in-memory ordered history. Each entry records diagnostic
intent/parameters, time and an outcome: changed, no-op, failed or cancelled.
A changed document entry also owns its before/after document snapshots and its
current applied/undone state. Undo finds the latest applied change; Redo finds the next
undone change. Both skip failed, cancelled and no-op attempts; selection navigation
is described below. There is no separate error log or second Undo stack.

A failure or no-op after Undo preserves the redo path. A new accepted change
marks the undone branch superseded and releases its snapshots, but retains its
operation records for explanation. A failed preview records its actual attempt;
successful preview updates remain temporary, and acceptance records the originating
tool and final requested parameters (including explicit cleanup), not a bare Accept.
Cancellation records the abandoned pending operation without an Undo step.

A read-only `read-history` request exposes cloned metadata without Undo snapshots;
`window.freacHistory()` and Capture fixture use this same path. Sketch inputs are
retained; Open diagnostics summarize IDs rather than copying complete BReps.
Fixture captures use the system temporary directory in development and production,
independent of the app launch directory; see [diagnostic fixtures](persistence.md#diagnostic-fixtures).
The history survives renderer reload with its backend owner. New/Open starts a
fresh document history; failed Open leaves the existing history intact. Normal
Save/Open does not serialize or replay these records. This is diagnostic memory
and ordinary snapshot navigation, not a revision, retry or event-replay protocol.

Deleting selected bodies or sketches is an immediate document edit; selected solid
topology is an immediate calculation and acceptance in one serialized backend call.
Neither leaves a pending candidate or UI lease. The calculation portion of topology
or mixed deletion is cancellable; acceptance remains atomic. Cancellation retains
selection and records a cancelled attempt, while timeout/geometric rejection records
a failure, without altering geometry or invalidating Redo. Explicit Accept and
committing sketch edits complete normally rather than being interrupted.

## Selection Undo (founder decision, 2026-09-22)

The same DocumentStore history includes ordered selection snapshots. Completed
selection changes remain individually undoable at the history tip, including
blank-click clearing, point choices and modeling targets. Navigation through
Undo/Redo never evicts these entries. A newly accepted document change supersedes
all selection entries, both applied and undone; its own before/after selection
snapshots remain available. Failed, cancelled and no-op edits preserve history.
A new selection after Undo branches normally, just like a new document change.
Double-click intermediate selections need no special history grouping.

The renderer buffers completed selection intent, flushing between gestures and
before each serialized model or history request. Selection writes drain before
a geometry request starts; they do not block further local selection input. The
renderer supplies the editing workspace and ordered typed sketch and modeling
targets; the backend owns their navigation snapshots alongside the
geometry snapshots. Gesture previews and automatic result-selection updates do
not create independent selection steps. Undo restores the operation's input
selection and workspace; Redo restores its result selection. Tool state, camera,
hover, chooser visibility and other transient controls are not replayed. These
selection snapshots are in-memory history, not saved document content.
