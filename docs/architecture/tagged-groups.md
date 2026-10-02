# Tagged geometry groups

Founder-approved design and implementation contract, 2026-10-01.
[Architecture index](../architecture.md).

## Purpose and ownership

A tagged group is a named reference to explicit geometry inside one entity.
Its main purpose is to give people and agents durable points of reference.
It does not modify geometry or define a procedural selection rule. For example,
tagging faces and edges records those members; it does not mean “all edges around
these faces” recalculated after every edit.

Each group has a stable document-local ID, a name, one owning entity, explicit
typed member references and an optional description. Names support discovery;
IDs support actions. Different groups may overlap freely, including on decorated
geometry. Faces and edges may coexist in a group. Members are whole topological
faces/edges; tagging a patch within a face requires dividing that face first.
The delivered member types are body faces and edges; sketch curves and derived
sketch regions are outside this first implementation.

Groups are document metadata owned by DocumentOwner, persisted with the drawing
and included in snapshot Undo/Redo. They are separate from decorators: no export
effect, support-surface restrictions or one-decorator-per-face restriction applies.
Reuse immediate topology correspondence, not the decorator model or lifecycle.
Accepted membership, temporary membership drafts and ordinary UI selection remain
distinct. Geometry changes and their membership continuation accept atomically.

## Interaction

- Display groups as children beneath their owning entity in Entities, behind a
  compact left-hand disclosure chevron. Creating a group expands its owner,
  including when previously collapsed; ordinary refreshes preserve manual collapse.
  Each group row has a visible remove icon that removes only its metadata, with Undo.
  Do not introduce nested groups.
- Tools → Tag geometry creates a group from an explicit selection within one entity. Mixed-owner
  membership is invalid rather than silently dropping selected geometry.
- Clicking a group selects its current members using ordinary selection behavior.
  Subsequent geometry tools act on those members.
- Double-click enters modal membership editing. Ordinary click, modifier, box and
  overlap selection rules apply, restricted to the owner. Navigation remains
  available; geometry editing is disabled during the draft.
  Enter on a focused group row also opens the editor. Shift-click adds all members;
  Command/Ctrl-click removes them if all are selected, otherwise adds missing members.
- Edit the name and optional description in the same interaction. Group-row
  double-click therefore edits membership rather than using entity-row inline rename.
- Enter/Done commits the draft as one Undo step; Escape discards it. Membership
  editing is not a sequence of accepted document edits for individual picks.
- Removing a group is an explicit metadata action, distinct from deleting its
  selected geometry.

## Continuation through geometry edits

Use kernel correspondence first. Where it is absent, bounded geometric matching
may supply an inferred match. An inferred match must be identified as inferred in
both the panel and agent inspection; do not silently present a guess as certainty.
The current fallback requires a unique match in both directions within the related
result body: equal support type and orientation, area/length within 1e-8 times
max(1, original measure), and centroid coordinates within 1e-7 mm. It considers only
results without predecessor references. These signatures are not proof of identity;
ambiguous or substantially changed geometry is left missing rather than assigned
to a nearest neighbor. There is no broad geometric search across unrelated bodies.
Continuation follows same-kind topology: an edge removed by a fillet does not
automatically tag the newly generated fillet face.

| Change | Result |
| --- | --- |
| Member survives or moves | Retain it. |
| Member splits within one entity | Include all corresponding descendants. |
| Some members disappear | Keep survivors and mark the group as changed. |
| Tagged and untagged geometry merge into a member | Include the merged member and flag that membership expanded. |
| All members disappear while the owner survives | Retain an empty group marked Missing geometry, preserving its name and purpose for repair. |
| Owner splits into several entities | Create an independently editable group on each result with relevant descendants. |
| Owners combine | Keep their groups separate, even when names or memberships overlap. |

A split across owners must be reported explicitly to agents. Do not silently make
the old group ID refer to an arbitrary fragment. Groups remain single-owner; a split
does not introduce a cross-entity parent group or persistent dependency graph.
Split results receive fresh IDs and an informational `splitFrom` naming the old
group. Copying a body retains its original groups and creates independent copies
with fresh IDs. Subsequent edits never replay correspondence stored on an unchanged
body. Deleting an owner removes its groups in the same Undo step. Explicit membership
replacement acknowledges and clears continuation diagnostics; rename alone does not.

## Agent interface

Expose listing, inspection, creation, renaming, membership replacement and removal
through the same document edits as the UI. Inspection returns current members,
descriptions and continuation problems. Agents can use a group as an operation
target without first changing UI selection. Resolve against the current document
or script candidate, not a cached face list from an earlier inspection.

The scripting API exposes `taggedGroups()`, `editTaggedGroup` with create/update/remove
actions, and `applyTaggedGroup({id, operation})`. Direct operations currently cover
offsetFaces, moveFaces, finishEdges, shell and scale through their existing handlers.
Incompatible mixed member types reject atomically; nothing is silently dropped.
`makeshift inspect` includes groups, `makeshift inspect GROUP_ID` returns one, and
`makeshift select GROUP_ID` selects its members without changing geometry. Overlapping
group/individual selections are deduplicated. Scripts keep their ordinary atomic
acceptance and rollback behavior.

## Implementation and acceptance

`src/backend/kernel-result.ts` receives predecessor references for both faces and
edges and preserves IDs for one-to-one continuations. The immediate metadata map
in `src/model/body-correspondence.ts` retains both face and edge correspondence.
`src/backend/body-metadata.ts` applies the independent decorator and tagged-group
policies at the existing geometry boundaries. `src/tags` owns metadata validation,
continuation, UI editing and agent target resolution contracts. No kernel changes
or persistent topology history graph are required.

Acceptance must cover ordinary UI creation, reselection, modal membership editing,
cancel/accept, removal, geometry operations on selected members, Undo/Redo and
save/reopen. Exercise overlapping groups, mixed face/edge membership, rejected
mixed owners, split/merge/deletion, empty repairable groups and owner splits through
the real geometry path. Agent acceptance must cover the same edits, direct use as
an operation target and inspection of changed/inferred membership through hidden
Electron. Shared UI routes require headless Chromium and WebKit acceptance.
