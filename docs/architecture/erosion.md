# Eroded cavity copies

Erode takes whole bodies, a positive minimum thickness `t`, and a nonnegative
extra thickness allowance `e` in millimeters. It creates independent cavity bodies
and retains the originals. Thin regions may disappear, a cavity may split, and a
verified empty result is legitimate. These are ordinary materialized BReps with
stable new IDs, editable using the existing face, movement and Boolean tools.
There is no saved distance field or erosion feature recipe.

## Interaction and ownership

Select complete bodies and choose Erode from Tools. The local widget provides
Minimum thickness and Extra thickness allowance, plus an inward drag handle.
Drag release retains the temporary preview. Enter, the check button, or completing
by switching tools accepts; Escape cancels. Invalid parameters clear the candidate
and disable acceptance. Zero thickness is a no-op. Calculations use the shared
single-edit lease, busy state and native cancellation path.

Preview ghosts source bodies as display state only. Acceptance selects the new
cavities and hides their originals in the per-window entity visibility state, so
cavities can be edited immediately. Originals remain in the entity list and can be
shown or selected for subtraction. An empty result leaves the originals selected
and visible. A nonempty operation is one Undo step; Undo restores the source view.
Appearance and exact source geometry are not changed by ghosting.

A typical workflow is Erode, subtract rib solids from the cavity, then subtract the
remaining cavity pieces from the original. The cavity remains an editable negative
until that final Boolean operation.

## Geometric contract

For the original solid `S`, let `E_d(S)` denote its interior at least `d` from its
boundary. The accepted cavity `C` must satisfy, within the shared numerical budgets:

`E_(t+e)(S) ⊆ C ⊆ E_t(S)`.

Minimum thickness wins. The allowance limits extra material left behind; it is not
permission to make walls too thin or discard a spacious chamber. Analytic surfaces
and compact editable topology are preferred. Display triangulation is never an
accepted cavity representation.

The current implementation tries a conservative simplification and native inward
CAD offsets. Simplification proposes one batch of shallow protruding faces above
planar supports and heals them, spending at most half the allowance. It independently
checks containment and interior coverage before using that proposal. Failed
simplification falls back to the untouched source. Offset construction tries OCCT's
join modes on private copies and unifies coincident support surfaces.

Acceptance requires valid oriented closed solids, tight edge/vertex correspondence,
no self-intersections or orphan faces, containment in the original, whole-boundary
minimum separation, and coverage of all required interior regions. Coverage uses
adaptive cells with conservative distance bounds, not an unchecked sample grid.
Convex planar half-spaces and exact planar polygon triangles accelerate those
bounds; curved supports and exact kernel distances handle other regions. Unresolved
cells, the finite work limit, or kernel errors reject the proposal. An offset failure
alone never proves the interior empty; emptiness has its own coverage check.

## Current limits

There is no general distance-guided surface reconstruction fallback yet. Freeform
shapes and difficult offset intersections may reject even when a cavity exists.
Small allowances on complicated boundaries may exhaust the coverage work limit;
zero allowance is useful for certifiable cases such as convex polyhedra, but is not
a promise of exact erosion for every body. Increasing the allowance can help
verification and simplification but cannot guarantee construction. No dense faceted
BRep fallback or repeated primitive subtraction is used.

## Scripting and checks

`freac.erode({ids, thickness, allowance})` uses the same calculation and script
atomicity as manual tools. Its result includes retained originals and any unaffected
bodies, plus newly generated cavities. Empty cavities introduce no new bodies.

Geometry/workflow regressions: `tests/body-erosion.test.ts`. Independent coverage
checks: `cmake -S native/kernel -B .build/kernel -DFREAC_KERNEL_TESTS=ON`, build, then
`ctest --test-dir .build/kernel -R erosion-coverage --output-on-failure`. UI acceptance:
`node tests/erosion-ui.mjs` runs owned headless Chromium/WebKit and hidden Electron,
including cavity rib cuts and final subtraction. Activate the repository's Node
version before Node commands, as described in the development process.
