# Tagged geometry groups

Founder-approved design, 2026-10-01. Not yet implemented.
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

Groups are document metadata owned by DocumentOwner, persisted with the drawing
and included in snapshot Undo/Redo. They are separate from decorators: no export
effect, support-surface restrictions or one-decorator-per-face restriction applies.
Reuse immediate topology correspondence, not the decorator model or lifecycle.
Accepted membership, temporary membership drafts and ordinary UI selection remain
distinct. Geometry changes and their membership continuation accept atomically.

## Interaction

- Display groups as children beneath their owning entity in Entities, behind a
  disclosure arrow. Do not introduce nested groups.
- Create a group from an explicit selection within one entity. Mixed-owner
  membership is invalid rather than silently dropping selected geometry.
- Clicking a group selects its current members using ordinary selection behavior.
  Subsequent geometry tools act on those members.
- Double-click enters modal membership editing. Ordinary click, modifier, box and
  overlap selection rules apply, restricted to the owner. Navigation remains
  available; geometry editing is disabled during the draft.
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
The matching algorithm and tolerances still need implementation-time evaluation.

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

## Agent interface

Expose listing, inspection, creation, renaming, membership replacement and removal
through the same document edits as the UI. Inspection returns current members,
descriptions and continuation problems. Agents can use a group as an operation
target without first changing UI selection. Resolve against the current document
or script candidate, not a cached face list from an earlier inspection.

## Implementation starting point and acceptance

`src/backend/kernel-result.ts` receives predecessor references for both faces and
edges and preserves IDs for one-to-one continuations. The immediate metadata map
in `src/model/body-correspondence.ts` currently retains face correspondence only;
edge continuation needs that data retained too. Existing decorator continuation
is evidence for where metadata follows geometry, not the group policy.

Acceptance must cover ordinary UI creation, reselection, modal membership editing,
cancel/accept, removal, geometry operations on selected members, Undo/Redo and
save/reopen. Exercise overlapping groups, mixed face/edge membership, rejected
mixed owners, split/merge/deletion, empty repairable groups and owner splits through
the real geometry path. Agent acceptance must cover the same edits, direct use as
an operation target and inspection of changed/inferred membership through hidden
Electron. Shared UI routes require headless Chromium and WebKit acceptance.
