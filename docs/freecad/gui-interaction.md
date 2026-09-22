# GUI, selection and editing lifecycle

Source audit at `78e4038a564e4c8bfebb40119b41d67531232223`, 2026-09-13.
This chapter inspects GUI code and selected tests. It does not reproduce the
founder's bugs or establish that upstream fixes exist in the installed FreeCAD.
Lessons for the web client are recommendations, not copied architecture.

Freac face-entry follow-up: a semantic face center and normal do not specify the
deterministic sketch corner and U/V axes. The native query and presentation now
share derived face frames, with [bounded native evidence](https://github.com/osuushi/freac/blob/3a4615641204f3a90683c590f52bfe3f81b29f87/docs/evidence/face-frame-publication.md).
Review caught a doubly translated test fixture and a read-only test that checked
only nonempty saves; independent expected coordinates and before/after archive
equality replaced those weak checks. This is Freac evidence, not a new upstream
source claim; the inspected FreeCAD revision is unchanged. Frame wire exposure
and ordinary face entry remain unverified.

## Freac implementation follow-up: creation and editor lifetimes

Reset sketch editor, 2026-09-14: founder review exposed that showing endpoint
handles after creation must not implicitly select those points for movement.
A press now stays pending until a completed click selects a point or pointer
travel starts drawing from its snapped location. Hover remains a separate guide;
Option bypasses geometry attraction while a toolbar toggle controls grid snapping.
The ordinary-input `tests/ui-point-intent.mjs` route checks joined independent
segments, selection on mouseup, endpoint movement, edge/center starts and the
independent snap controls in Chromium, WebKit and hidden Electron. This is Freac
runtime evidence, with the upstream inspected revision unchanged. It does not
establish touch/Pencil behavior or inferred persistent coincidence constraints.


The later [FACE profile selection check](https://github.com/osuushi/freac/blob/3a4615641204f3a90683c590f52bfe3f81b29f87/docs/evidence/face-profile-selection.md)
adds two independent Freac lessons. A body-first coincident-hit policy appropriate
for an original extrusion base can block selecting a new sketch profile on a
face; use explicit workspace context rather than globally reversing the tie.
Transparent grid lines can still write depth and hide coincident sketch edges.
Before/after ordinary WebKit/Electron screenshots isolated that depth-write
effect from color contrast. The pinned upstream revision is unchanged; this is
Freac runtime evidence, not a claim about the native FreeCAD renderer.

Freac integration following `01147f2` separates release-time creation from a
revision-bound editor for accepted geometry. Dismissing fields does not delete
the rectangle, and a generation check prevents a late response from reopening
an abandoned editor. Undo discards unfinished field text before changing history;
otherwise ordinary button focus changes can accidentally create another command.
These are Freac implementation lessons, not claims about upstream behavior.

Ordinary pointer/keyboard tests in hidden Electron and headless WebKit verified
blank-click and orbit acceptance, invalid-value preservation, re-entry and
dependent extrusion updates. Controlled editor probes cover late replies and
changed identities. See the evidence and coverage gaps (historical; `git show 2485a97:docs/evidence/rectangle-lifecycle.md`).
The bounded rectangle hit test is not a general selection or topology solution.

The face-editing follow-up exposed a coincident-hit case: the source region and
an extrusion's base occupy the same plane. Ordinary underside selection in
hidden Electron selected the region, while the corresponding WebKit run selected
the body. Sorting intersections by distance alone does not define that tie.
Freac's bounded 3D policy now needs body preference for coincident hits, while
preserving a genuinely nearer region. This is a Freac runtime finding; the
upstream inspected revision remains `78e4038a564e4c8bfebb40119b41d67531232223`.
See face-editing evidence (historical; `git show 2485a97:docs/evidence/face-edit-handoff.md`) for the regression
and final verification. It does not establish a general pick-cycling policy.

## Entry must resolve context before tearing down the old context

Freac's workspace integration adds a related failure probe: a region cell ID
can recur in another workspace or a later revision. The renderer now qualifies
picking by workspace and discards selected region tokens across document,
session or revision changes. It does not infer durable geometry from a repeated
cell ID. Extrusion captures the selected workspace normal, and local controls
retain the full world-space anchor. Focused ownership/geometry checks and the
ordinary XY regression are recorded in [the evidence](https://github.com/osuushi/freac/blob/3a4615641204f3a90683c590f52bfe3f81b29f87/docs/evidence/workspace-picking-extrusion.md).
Vertical-plane UI checks are recorded in the later
[entry evidence](https://github.com/osuushi/freac/blob/3a4615641204f3a90683c590f52bfe3f81b29f87/docs/evidence/origin-plane-entry.md). This is Freac implementation
evidence; the inspected upstream revision above is unchanged.

The rectangle migration also exposed a distinction between field-value rendering
and preview positioning: calling the former on every input would overwrite
partial numeric text. Freac keeps those paths separate. Gestures capture plane
context, projection and snap data once, while accepted editor targets resolve by
workspace. Missing targets close controls even after a successful reply. See
[captured-context evidence](https://github.com/osuushi/freac/blob/3a4615641204f3a90683c590f52bfe3f81b29f87/docs/evidence/sketch-context-tools.md) for focused checks,
the ordinary XY regression and subsequent vertical UI coverage. This adds Freac
lessons without changing the upstream source claims below.

Origin-plane entry then exposed a visual counterexample: labels had distinct
projected anchors but still overlapped as rendered buttons. Measured rectangle
placement and screenshot review were needed alongside hit/entry tests. A stored
workspace can also disappear when Undo removes its first drawing; the controller
retains that same empty origin context rather than silently choosing XY. The
[entry evidence](https://github.com/osuushi/freac/blob/3a4615641204f3a90683c590f52bfe3f81b29f87/docs/evidence/origin-plane-entry.md) separates those ordinary checks
from remaining device and navigation coverage. Upstream revision is unchanged.

`Gui::Document::trySetEdit` resolves parent/subobject context before
`resetIfEditing`. An explicit regression comment explains why: finishing the old
sketch restores its selection, which previously clobbered the selection needed
to find the new sketch's parent. It then sets the edit document, starts the view
provider, connects the editing viewer and signals edit mode.
[Document.cpp L682-L730](https://github.com/FreeCAD/FreeCAD/blob/78e4038a564e4c8bfebb40119b41d67531232223/src/Gui/Document.cpp#L682-L730).

**Freac implication:** capture an immutable entry intent (workspace, plane,
revision and approached camera context), validate it, and only then replace the
old editing session. Never infer the next workspace from selection after cleanup.
Probe switching between overlapping sketches while the previous session has a
pending field and retained selection.

## Cleanup can delete the object being cleaned up

`Document::_resetEdit` resets editing viewers, invokes `finishEditing`, then checks
its view-provider pointer again because that call may have deleted the object.
It clears editing state and coordinates a booked transaction. This is an explicit
reentrancy/lifetime defense, not incidental boilerplate.
[Document.cpp L760-L801](https://github.com/FreeCAD/FreeCAD/blob/78e4038a564e4c8bfebb40119b41d67531232223/src/Gui/Document.cpp#L760-L801).

**Freac implication:** disposal must be idempotent; callbacks and delayed replies
must verify session identity. Model deletion and UI session disposal are distinct.
Clearing the active workspace should transition to a valid empty state. Probe
clear/delete during dimension editing and while a preview response is in flight.

## Tree and viewport are separate interaction entry points

The tree activates a view, optionally opens a transaction, invokes the object's
view provider `doubleClicked`, and may record a macro command; it can fall back
to ordinary Qt tree behavior. It does not automatically share an addon's viewport
entry policy. [Tree.cpp L2121-L2179](https://github.com/FreeCAD/FreeCAD/blob/78e4038a564e4c8bfebb40119b41d67531232223/src/Gui/Tree.cpp#L2121-L2179).

**Freac implication:** navigator and viewport should dispatch the same semantic
entry command, with different hit-resolution inputs. A component-specific
`doubleClick` hook should not secretly choose another editor. Test the same
workspace identity through both entry points, then draw into it.

## Selection notifications are queued and revalidated

`SelectionSingleton::notify` queues recursive notifications, drains them in order,
and checks whether an add/remove/preselection message still agrees with current
state before forwarding it to view providers and observers.
[Selection.cpp L600-L646](https://github.com/FreeCAD/FreeCAD/blob/78e4038a564e4c8bfebb40119b41d67531232223/src/Gui/Selection/Selection.cpp#L600-L646).

**Freac implication:** selection and hover are state transitions, not unrestricted
recursive UI callbacks. Use one owner per gesture/tool, and revision/session
checks for asynchronous updates. Do not copy the global singleton as a requirement.
Probe an observer or incoming model update that removes the target during a
selection notification; obsolete highlight must not reappear.

## Deletion must invalidate every kind of transient reference

`slotDeletedObject` clears preselection, removes selected objects by resolved or
original pointer, and removes picked-list entries. Its comment acknowledges that
not walking every nested hierarchy may leave stray selection.
[Selection.cpp L2193-L2243](https://github.com/FreeCAD/FreeCAD/blob/78e4038a564e4c8bfebb40119b41d67531232223/src/Gui/Selection/Selection.cpp#L2193-L2243).
`SelectionObserver` detaches on destruction, showing explicit subscription lifetime
ownership. [Selection.cpp L94-L120](https://github.com/FreeCAD/FreeCAD/blob/78e4038a564e4c8bfebb40119b41d67531232223/src/Gui/Selection/Selection.cpp#L94-L120).

**Freac implication:** invalidate hover, selection, snap candidate, active handle,
inline field and pending command references together. Each subscription belongs
to a disposable document/session. Test repeated document open/close and deletion
of linked/nested targets, including delayed messages from the closed document.

## A drag owns its whole event stream

`handleSelectionDragMotion` offers the event to the viewer first and keeps
selection out of a viewer-owned drag. `tryStartBoxSelection` checks selection
preferences, editing mode, an active scene grabber, movement threshold and a
handle under the cursor. Once it starts a drag it clears the double-click
candidate. [NavigationStyle.cpp L2010-L2067](https://github.com/FreeCAD/FreeCAD/blob/78e4038a564e4c8bfebb40119b41d67531232223/src/Gui/Navigation/NavigationStyle.cpp#L2010-L2067).

**Freac implication:** use explicit pointer capture/gesture ownership. Tool, camera,
box selection, and dimension handles cannot independently claim the same release.
Treat drag, click and double-click as distinct recognized gestures. Probe tiny
movement, release outside the canvas, cancellation, and double-click after a drag.

`syncModifierKeys` reconciles modifier state from the event because key transitions
may happen outside the viewer. [NavigationStyle.cpp L2133-L2147](https://github.com/FreeCAD/FreeCAD/blob/78e4038a564e4c8bfebb40119b41d67531232223/src/Gui/Navigation/NavigationStyle.cpp#L2133-L2147).
This supports testing app switching, lost focus and modifier release away from
the canvas; a web implementation must also define lost-pointer cancellation.

## Upstream tests and limitations

Freac follow-up (2026-09-13): normal lost-pointer-capture cleanup initially
removed the rectangle dimension panel; ownership-aware cleanup fixed release.
Extrusion completion also needed separation from cancellation's planar camera
reset. These are Freac findings, not new upstream claims about inspected revision
78e4038a564e4c8bfebb40119b41d67531232223. See [runtime evidence](https://github.com/osuushi/freac/blob/3a4615641204f3a90683c590f52bfe3f81b29f87/docs/evidence/d3b-feedback.md)
for tested engines and coverage gaps.

The first founder review rejected implicit XY entry, grouped dimension panels,
dark defaults and sketch-mode extrusion. The correction separates tool intent
from plane context and projects individual controls beside geometry. A follow-up
probe caught R being ignored when a plane button retained focus; ordinary-key
testing now includes that route. See [spatial feedback evidence](https://github.com/osuushi/freac/blob/3a4615641204f3a90683c590f52bfe3f81b29f87/docs/evidence/spatial-feedback.md).
This is Freac runtime evidence; upstream source provenance above is unchanged.

`testSelectionUsesActiveGateWithoutKeepingRejectionReason` checks a query can
accept/reject without changing selection/preselection or the gate's prior reason.
`choosesAllowedCandidateWhenPreferredPickIsRejected` exercises candidate policy;
`preservesPriorityChoiceWithinFirstOwner` exercises ownership/priority ordering.
[SelectionTest.cpp L98-L157](https://github.com/FreeCAD/FreeCAD/blob/78e4038a564e4c8bfebb40119b41d67531232223/tests/src/Gui/SelectionTest.cpp#L98-L157).

Those are useful policy tests, not proof of end-to-end usability. This audit did
not run them or trace Qt platform focus, Coin rendering performance, Tasks dock
layout, native accessibility, IME input or touch/Pencil delivery. Keep those as
explicit future acceptance concerns instead of assuming a web stack removes them.


## Freac D4 implementation lesson (2026-09-13)

The inspected upstream revision remains
`78e4038a564e4c8bfebb40119b41d67531232223`; this adds Freac runtime evidence,
not a new claim about FreeCAD behavior. An external terminal command can finish
while a user tool is pending. Dropping that notification leaves the viewport
stale; retain and coalesce it, then refresh after the tool settles. Cancel only
nonpending transient geometry before installing the new revision. The focused
scheduler tests cover delayed consumption and disposal. Ordinary Electron
terminal commands also verified visible updates and shared mouse Undo/Redo.

PTY ownership needs the same lifecycle discipline: old exit/output callbacks
must not affect a reopened session, and panel close must finish before opening
a replacement shell. Hidden Electron verified close/reopen; injected lifecycle
tests cover obsolete callbacks. Source reload with model recovery, remote
reconnect, and physical iPad input remain gaps. See
[terminal evidence](https://github.com/osuushi/freac/blob/3a4615641204f3a90683c590f52bfe3f81b29f87/docs/evidence/d4-terminal-preflight.md).


The subsequent [D4 agent/user handoff](https://github.com/osuushi/freac/blob/3a4615641204f3a90683c590f52bfe3f81b29f87/docs/evidence/d4-agent-handoff.md) retained
one live conversation while mouse actions changed the revision. A held agent
revision was rejected after mouse Undo/Redo; a fresh agent query could instead
act on the new state. This is Freac runtime evidence for the revision boundary,
not evidence for universal topology remapping or committed-parameter editing.
The upstream inspection revision above is unchanged.

## Freac face-entry implementation lesson (2026-09-14)

The upstream inspection revision remains
`78e4038a564e4c8bfebb40119b41d67531232223`; this is independent Freac evidence.
Entry must retain the selected semantic face across asynchronous editor dismissal,
then resolve its fresh frame without allocating drawing. Capturing a plane alone
would lose the support relationship. The cap route now passes ordinary input
in headless WebKit and hidden Electron, including dimension edits and re-entry.
Passing those assertions still missed a profile visibility defect after closing
the editor. Read-only native presentation showed correct world-space vertices;
visual inspection was necessary to distinguish rendering from lost geometry.
See [entry evidence](https://github.com/osuushi/freac/blob/3a4615641204f3a90683c590f52bfe3f81b29f87/docs/evidence/face-entry.md) for explicit coverage gaps.

## Freac point-chooser follow-up (2026-09-14)

Upstream revision is unchanged; no upstream code was copied for this increment.
Freac's point chooser exposed a concrete lifecycle failure: reopening the same
junction on Shift replaced the button just before Shift-click. Keeping the menu
identity stable for unchanged candidate point keys resolves that race. Explicit
point choices narrow a point drag; ordinary whole-curve Shift/Control selection
retains its prior meaning. Selection changes neither document geometry nor Undo.
Headless Chromium/WebKit and hidden Electron ordinary-input routes cover these
behaviors, circle centers, arc endpoints and rectangle corners. Screenshot pixels
verify selection gradients and hover branches; visual review caught and removed
dimension controls covering the chooser. Physical touch/Pencil behavior and
persistent Fuse/Unfuse remain unverified/unimplemented respectively.
