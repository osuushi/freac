# Numerical geometry

Native coordinates and distances use millimeters; volume uses cubic millimeters.
`native/kernel/geometry-policy.h` names the budgets used by boundary reconnection,
Shell/Face Offset validation and projection. These are checks for distinct tasks,
not one global precision setting or a replacement for OCCT entity tolerances.

| Policy | Value | Purpose |
| --- | --- | --- |
| Minimum solid volume | 1e-12 mm³ | Solid extraction and reconstructed/offset material must exceed the same floor. Reconnection and offset also require positive signed volume, retaining the orientation check. |
| Boundary distance | 1e-6 mm | Reconnection fitting, offset boundary/surface agreement and minimum Shell/Offset separation. |
| Offset topology tolerance | 2e-6 mm | Bounds recorded on generated faces, edges and vertices; conservative rounded-join bounds do not enlarge the geometric distance budget. |
| Generated vertex adjustment | 0.001 mm | Maximum correction of a generated vertex onto its incident curves. Retained source vertices cannot move; the corrected geometry must still satisfy the boundary-distance budget. |
| Parameter correspondence | 1e-7 mm | Recompute spatial-curve/parameter-curve agreement on a private operand copy before offsetting. |
| Projection approximation | 0.001 mm total | 0.0005 mm fitting plus 0.0005 mm endpoint correction. Analytic arc endpoint correction must also stay within the total budget after radius/center amplification. |
| Collapsed projected segment | 1e-7 mm | Reject an edge whose planar image is a point. |
| Edge-on direction dot | 1e-12, dimensionless | Recognize a circle viewed along its plane and project its extrema to a segment. |
| Full circle angle | 1e-9 radians | Distinguish a complete circle from a trimmed arc. |

The volume floor does not establish a minimum supported feature size. Operations
also enforce valid BReps, closed shells, noncollapsed boundaries and their own
feasibility checks. A valid small solid must not fail reconnection merely because
that path applies an unrelated, larger volume floor. Large coordinate magnitudes
likewise do not relax distance checks. Projection rejects curves outside its error
budget rather than silently accepting a coarser approximation.

New body fillets request 1e-7 fitting tolerances for the spatial and parameter
curves and blend approximation. This makes subsequent precision-checked offsets
possible at sphere/plane and sphere/cylinder junctions without relaxing their
1e-6 mm boundary budget. These are construction targets, not a claim that every
fillet meets the offset budget; offset operations still measure their input and
reject coarse older or imported geometry.
