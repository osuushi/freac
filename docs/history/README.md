# Historical planning and delivery records

Read only to investigate prior decisions or verification. These files preserve
the former long-form docs; their old next steps and review instructions are not
authorization. Current user requests determine active work.

- [Delivery record 1](delivery-01.md): 3D tool cleanup and Modify selection ready for founder testing (2026-09-16):
- [Delivery record 2](delivery-02.md): Planar offset contact/merge accepted (2026-09-16):
- [Delivery record 3](delivery-03.md): Standalone Booleans and preceding sketch/solid reviews (2026-09-15).
- [Delivery record 4](delivery-04.md): Architecture tightening implemented; founder review next (2026-09-15).

- [Completed sketch queue](sketch-queue.md).
- Original [design reset](design-reset.md),
  [checkpoints](design-checkpoints.md), [process reset](process-reset.md) and
  [pace guidance](pace.md).

Do not append routine progress here. Use the active local brief for immediate continuity.

## Retired prototype

The old `apps/desktop/`, `proofs/`, `docs/specs/` and `docs/evidence/` trees
were retired from the working tree. Their last complete state is Git revision
`3a4615641204f3a90683c590f52bfe3f81b29f87`. Reference chapters link to that revision where historical
geometry or solver evidence remains useful.

Inspect an old file with `git show 3a4615641204f3a90683c590f52bfe3f81b29f87:path/to/file`.
For a separate recovery checkout, run:

```sh
git worktree add --detach ../freac-prototype 3a4615641204f3a90683c590f52bfe3f81b29f87
```

That checkout includes the old launch/build instructions; its dependencies must
be prepared separately. The current app cannot open prototype archives and never
silently migrates them. Genuine archive bytes and original provenance remain in
[the regression fixtures](../../tests/fixtures/legacy-archives/README.md).
The separate `../freak` FreeCAD workbench is unaffected.
