# Shell

Founder request, 2026-09-17: follow the current surface inward or outward, leave
selected faces open where feasible, and reject rather than publish invalid geometry.

## Interaction and ownership

Select solid faces or bodies and choose **Shell / S**. A partial face selection
specifies openings; a body or complete face coverage specifies a closed hollow.
Explicit edges and non-solid targets are unavailable. Mixed whole bodies and
partial face selections across bodies use those meanings independently.
The local signed thickness field and arrow use negative inward / positive outward.
Rounded offset joins follow the distance envelope around corners. The tool retains
the original surface on the other side of the wall; it does not center thickness
on the surface. The card states the number of openings or “Closed hollow”.

Drag release retains the temporary result. Enter/check or switching tools accepts
one Undo step; Escape/cross cancels and restores selection. Zero exits without an
edit. Invalid requests turn the arrow/field red, remove the invalid preview and
prevent acceptance, including through tool switching. Thickness is never clamped.
The user can correct the value directly. Native cancellation remains available.

`BodyShell` contains document-local body IDs, opening face IDs and signed thickness.
`DocumentOwner` computes against accepted current BReps and accepts all participating
bodies atomically. There is no feature recipe or second document owner. Retained
original entities retain IDs, including through verified analytic reparameterization;
parallel faces and opening rims receive new IDs.
The materialized result supports ordinary selection, movement and face edits;
Save/Open does not replay Shell. Failed inputs and reasons use ordinary history.

## Geometry and rejection

Open walls use OCCT `MakeThickSolidByJoin`. Closed hollows use `PerformByJoin`
and a checked Boolean difference. Both use arc joins, 1e-7 mm construction tolerance,
and leave the incomplete all-parallel intersection/self-intersection-removal options
disabled. There is no fallback to meshing, topology repair or a reduced thickness.

Some cylindrical fillets are stored as rational splines. Before construction, Shell
can recognize these supports and their line/circle boundaries at 1e-7 mm tolerance.
It reparameterizes the faces and all affected boundary curves together, checks
surface samples and boundary endpoints, and rebuilds same-parameter pcurves.
The prepared solid must pass the full solid checks and warning-free Boolean
comparison against the source in both directions. Source topology correspondence
preserves face IDs and the requested openings; orientations come from the prepared
solid, not the modifier's local history. The accepted source BRep stays untouched.
This conversion is specific to cylindrical representations. It neither widens the
wall tolerance nor changes the requested thickness.

Nonanalytic bodies, including spline/Bezier and offset surfaces, are first deep-copied
using the preparation shared with Face Offset, and their boundary pcurves recomputed
with `BRepLib::SameParameter` at 1e-7 mm. Spatial curves and surfaces are retained;
the prepared BRep must pass the ordinary strict solid checks. This handles swept
faces whose existing parameter correspondence is coarser than their geometry.
Copied face orientations come from the complete solid, not local copy history.
Generated freeform offset pcurves are likewise recomputed before validation.
The serialized source and prepared input must remain unchanged by construction.

Before publishing, each body must have:

- Exactly one positive, consistently oriented solid with closed wall boundaries;
  multiple shells are legitimate for a sealed cavity.
- Valid BRep geometry, exact curve-on-surface checks, no detected self-interference,
  and topology tolerances no larger than 2e-6 mm. OCCT rounded joins can carry
  conservative 1.1e-6 mm vertex bounds; those are separate from the 1e-6 mm
  geometric distance tolerance.
- Unchanged serialized input geometry/topology (ignoring only the root container
  ownership flag), every retained prepared face still present, and every requested opening losing
  positive area (a rim strip is allowed).
- An identifiable parallel for each retained face, sampled against the signed
  offset surface within 1e-6 mm, plus whole-skin minimum separation
  at least the requested thickness minus that tolerance.
  Freeform correspondence samples every C2 parameter span; sampled offset normals
  must stay regular and retain orientation relative to the source. Analytic offsets
  use OCCT's exact equivalent surface; other supports use `Geom_OffsetSurface`.
- Material on the requested side: inward wall minus source, or outward wall
  intersect source, has no material above max(1e-9 mm³, source volume × 1e-10).
  Inward hollowing must actually remove volume. Verification Booleans reject warnings.

Inputs below or equal to 1e-5 mm absolute thickness reject. Analytic planar,
cylindrical, conical, spherical and ring-toroidal supports are eligible; collapsed
radii reject. Freeform supports are attempted with the same geometry, correspondence,
separation and containment checks; merely completing OCCT's offset does not suffice.
Splits, missing correspondence, changed preserved faces, excess tolerances,
collisions, kernel failure or inability to verify also reject atomically.

These are conservative numerical acceptance checks, not a mathematical certificate
for every BRep or a claim that all feasible shells can be constructed. Some complex
surfaces and face subsets will fail. On the captured bent sweep, both open ends
work inward/outward; one inward single-opening choice and inward closed hollowing
still fail boundary validation. Outward +2 mm reaches self-interference and rejects.
No topology-changing repair or reduced-thickness fallback is used. Source observations are recorded in
[the kernel reference](../freecad/kernel-topology.md).
