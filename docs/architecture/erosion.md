# Eroded bodies

Erode takes whole bodies, a positive minimum thickness `t`, and a nonnegative
extra thickness allowance `e` in millimeters. It creates independent bodies and
optionally retains the originals. Thin regions may disappear, a body may split, and a
verified empty result is legitimate. These are ordinary materialized BReps with
stable new IDs, editable using the existing face, movement and Boolean tools.
There is no saved distance field or erosion feature recipe.

## Interaction and ownership

Select complete bodies and choose Erode from Tools. The local widget provides
Minimum thickness, Extra thickness allowance, and Keep originals, plus an inward drag handle.
Entering Erode starts a preview immediately. Each new operation starts with 1 mm
minimum thickness, 50% extra allowance and Keep originals enabled; values belong to
that operation and are not remembered for another selection or invocation.
The allowance is a percentage of minimum thickness and stays fixed while typing
or dragging thickness: 4 mm at 50% allows 2 mm extra thickness. The renderer
converts it to millimeters for the existing geometry API.
Inward dragging clamps at a positive 0.001 mm.
Drag release retains the temporary preview. Enter, the check button, or completing
by switching tools accepts; Escape or either cancel button interrupts native work,
discards the candidate and returns to Select. The panel closes on acceptance or
cancellation. Changed numeric targets interrupt obsolete calculations and retain
only the latest requested values. Invalid parameters clear the candidate
and disable acceptance. Zero thickness is a no-op. Calculations use the shared
single-edit lease, busy state and native cancellation path.
While Erode is active, Undo/Redo restores completed thickness, allowance and Keep
originals tweaks through the same preview path. Acceptance remains one document
Undo step; cancellation discards the temporary parameter history.

With Keep originals enabled (the default), preview ghosts source bodies as display
state only. Acceptance selects the new bodies and hides their originals in the
per-window entity visibility state, so
results can be edited immediately. Originals remain in the entity list and can be
shown or selected for subtraction. An empty result leaves retained originals selected
and visible. Turning Keep originals off replaces the selected sources, including
removing them for a verified empty result. Undo restores replaced originals.
An operation that changes the document is one Undo step; Undo restores the source view.
Appearance and exact source geometry are not changed by ghosting.

A cavity-making workflow is Erode, subtract rib solids from the new body, then
subtract its remaining pieces from the original. These pieces remain ordinary
positive bodies until the final Boolean operation creates the cavity.

## Geometric contract

For the original solid `S`, let `E_d(S)` denote its interior at least `d` from its
boundary. The accepted result `C` must satisfy, within the shared numerical budgets:

`E_(t+e)(S) ⊆ C ⊆ E_t(S)`.

Minimum thickness wins. The allowance limits extra material left behind; it is not
permission to make walls too thin or discard a spacious chamber. Analytic surfaces
and compact editable topology are preferred. Display triangulation is never an
accepted result representation.

The current implementation tries a conservative simplification and native inward
CAD offsets. Simplification proposes one batch of shallow protruding faces above
planar supports and heals them, spending at most half the allowance. It independently
checks containment and interior coverage before using that proposal. Failed
simplification falls back to the untouched source. Offset construction tries OCCT's
join modes on private copies and unifies coincident support surfaces. If a round
collapses at the requested depth, construction also tries half the extra allowance;
verification still uses the original requested bounds. Valid source pcurves are
preserved rather than forcibly reparameterized.

Additional construction proposals remove collapsed cylindrical branches and convex
toroidal rounds, retaining globally supporting planar caps. Every proposal is
verified against the untouched source. Separate closed inner shells are existing
voids: their enclosures expand outward while the outer enclosure shrinks, followed
by one Boolean cut. This permits cavity merging and breakthrough. Optional
same-domain cleanup is retained only if its topology remains valid.

Acceptance requires valid oriented closed solids, tight edge/vertex correspondence,
no self-intersections or orphan faces, containment in the original, whole-boundary
minimum separation, and coverage of all required interior regions. Coverage uses
adaptive cells with conservative distance bounds, not an unchecked sample grid.
Convex planar half-spaces and exact planar polygon triangles accelerate those
bounds; curved supports, indexed points on exact boundary curves, and exact kernel
distances handle other regions. Curve points provide upper bounds only. Certified
interior/exterior distance balls and boundary-free spans reuse classifications
across neighboring cells. Unresolved cells, the finite work limit, or kernel errors
reject the proposal. An offset failure
alone never proves the interior empty; emptiness has its own coverage check.
Calculation coordinates follow a source surface frame so rigid placement does not
needlessly multiply Cartesian cells. Full concentric spherical shells additionally
have an exact radial-interval coverage certificate. These change verification cost,
not accepted geometry or distance budgets.

Cells with the largest unresolved clearance are checked first. A coverage-limit
failure stops repeated construction attempts rather than spending the same limit
again on similar proposals. When a minimum-thickness-valid candidate supplies a
finite bound on its remaining uncovered regions, the failure includes a rounded,
conservative allowance suggestion with 32% headroom before rounding upward.
The UI rounds this upward to a multiple of 10%. The local **Try …% allowance** button
changes only the allowance and recalculates through the normal validation path.
It is guidance, not automatic acceptance or a guarantee for every selected body;
unsupported construction/precision failures may have no useful suggestion.

Generated offsets must also survive exact BRep storage and readback. If a private
stored result needs parameter correspondence repair, it is remeasured and must
survive another round trip before the usual solid, separation and coverage checks.
Source geometry and numerical budgets are unchanged.

## Complex cases

The reproducible matrix below uses millimeters. Each nonempty result is checked
with exact Boolean material/void probes, in addition to the full acceptance checks.
Known analytic volumes are asserted independently. All cases preserve the accepted
source through preview and exercise acceptance, Undo/Redo and document reopening.

| Case | Thickness / allowance | Expected behavior |
| --- | --- | --- |
| Long 1 mm thick planar fin | 1 / 0.25 | Fin disappears; broad block survives. |
| Radius 0.6 cylindrical branch on radius 6 body | 1 / 0.25 | Branch disappears; main cylindrical interior survives. |
| Torus, major radius 8 and minor radius 3 | 1 / 0.25 | Minor radius becomes 2; central hole stays open. |
| Two fused tori, centers 18 apart | 0.8 / 0.6 | Connected result preserves both holes and outer lobes. |
| Plate with two radius 2 through-bores | 1 / 0.25 | Planar exterior shrinks; both bores expand to radius 3. |
| Radius 8 sphere cut by a plane | 1 / 0.25 | Sphere radius becomes 7; planar bottom moves inward by 1. |
| Same hemisphere with radius 0.75 rim fillet | 1 / 0.5 | Collapsed rim is simplified; planar cap remains. |
| Radius 6 sphere joined to radius 3 cylinder | 0.8 / 0.3 | Both bulb and stem survive their sharp junction. |
| Same join with radius 0.75 fillet | 0.8 / 0.3 | Blended junction yields an editable connected interior. |
| 20 mm cube with radius 0.2 sealed void | 1 / 0.25 | Tiny void expands to radius 1.2; it is not filled. |
| Cube with two radius 0.4 sealed voids | 1 / 0.25 | Both voids expand independently to radius 1.4. |
| Two radius 0.5 voids, centers 4 apart | 1.7 / 0.25 | Expanded voids merge; intervening material disappears. |
| Radius 0.8 void centered 1.8 from cube side | 0.8 / 0.25 | Expanded void breaks through the eroded exterior. |
| Concentric spherical shell, radii 8 and 6 | 0.5 / 0.2 | Surviving shell has radii 7.5 and 6.5. |
| Same spherical shell beyond collapse | 1.1 / 0.2 | Verified empty result. |
| Torus near collapse | 2.8 / 0.1 | Thin but valid minor-radius 0.2 torus remains. |
| Torus beyond collapse | 3.1 / 0.2 | Verified empty result. |

Boundary regressions also cover exact zero-volume collapse (spherical shell at 1,
torus at 3, both with zero allowance), atomic rejection of the round branch with
zero allowance, and translated/rotated joined tori, filleted hemisphere and merging
cavities. Empty means no volumetric body; a residual mathematical surface or curve
at exact collapse is not retained as a solid.

## Current limits

There is no general distance-guided surface reconstruction fallback yet. Freeform
shapes and difficult offset intersections may reject even when an eroded body exists.
Small allowances on complicated boundaries may exhaust the coverage work limit;
zero allowance is useful for certifiable cases such as convex polyhedra, but is not
a promise of exact erosion for every body. Increasing the allowance can help
verification and simplification but cannot guarantee construction. No dense faceted
BRep fallback or repeated primitive subtraction is used.

Existing cavities always count as source boundaries, even when very small. Erode
expands them rather than filling or ignoring them. Thin protrusions can vanish,
but their thicker roots may require curved transition geometry; the current
construction rejects a zero-allowance round-branch case instead of silently
discarding that root. A disappearing fillet can leave a sharp result when it fits
the requested bounds. Increasing allowance can therefore change topology.

Older filleted bodies may carry curve/surface disagreement beyond the 1e-6 mm
source budget and still reject. New fillets use tighter fitting; Erode does not
silently relax precision for old files. General freeform repair remains separate.
Coverage has a 100,000-cell / 8-second limit per check. A coverage-limit failure
ends the proposal search with guidance where available. Preparation and other
kernel work can add time; cancellation interrupts the native worker rather than
waiting for those calculations to finish.
These are bounded construction and verification limits, not proof that the desired
interior does not exist.

A source-construction limitation was found for two major-radius 8/minor-radius 3
tori fused at exactly 16 mm center separation: the Boolean union can retain only
one lobe despite passing topology validity. This precedes Erode. The 18 mm fixture
checks source volume and symmetry as well as material in both eroded lobes; the
16 mm union remains a known Boolean defect, not a passing double-torus case.
The valid 18 mm source also exceeded coverage limits with a 0.3 mm allowance;
0.6 mm allows it to be certified without reducing the 0.8 mm minimum thickness.

## Scripting and checks

`makeshift.erode({ids, thickness, allowance, keepOriginals})` uses the same calculation and script
atomicity as manual tools. Its result includes retained originals and any unaffected
bodies, plus newly generated bodies. Empty results introduce no new bodies. `keepOriginals`
defaults to true.

Geometry/workflow regressions: `tests/body-erosion.test.ts` and the two captured
models in `tests/body-erosion-capture.test.ts`. Independent coverage
checks: `cmake -S native/kernel -B .build/kernel -DMAKESHIFT_KERNEL_TESTS=ON`, build, then
`ctest --test-dir .build/kernel -R erosion-coverage --output-on-failure`. UI acceptance:
`node tests/erosion-ui.mjs` runs owned headless Chromium/WebKit and hidden Electron,
including cavity rib cuts and final subtraction. Activate the repository's Node
version before Node commands, as described in the development process.
The complex matrix and boundary cases live in `tests/body-erosion-special.test.ts`
and `tests/body-erosion-special-boundaries.test.ts`, with shared fixture/probe files.
`node tests/erosion-special-ui.mjs` checks seven representative cases through actual
Open, selection, Erode fields, acceptance, Undo/Redo, movement and Save/Open in the
same three runtimes. Compile `tsconfig.test.json` before running this route.
The captured towers/plate responsiveness case is in `tests/erosion-responsiveness.test.ts`;
`node tests/erosion-responsiveness-ui.mjs` covers automatic entry, reset values,
all three cancellation routes and the allowance suggestion through acceptance,
history and Save/Open. `tests/document-failure.test.ts` checks feedback validation.
`node tests/erosion-history-ui.mjs` checks temporary parameter Undo/Redo, branching
after Undo and grouped document acceptance in all three runtimes.
