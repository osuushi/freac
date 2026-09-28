# Lessons from the three-part pump-holder recovery

Adapt these techniques to the measured dimensions of the current design. The original
recovery matched most sampled surfaces closely but still had local differences
up to 1.84 mm. It did not recover the original feature history.

## Reuse design intent where there is evidence

An archived generator contained the original cubic Bézier foot profile. Using
those curves recovered a compact solid more faithfully than converting every
triangle into a planar face. Preserve distinct left/right parts and their
placements; mirror only when the source actually establishes symmetry.

Fit planes, cylinders and spheres to measured regions. Keep the source mesh and
fit residuals. A mesh's faceted bore approximates a circle, so an analytic bore
will differ slightly even with the correct nominal diameter. Snap fitted values
to known dimensions only when supported by a source or a measured tolerance.

In the pump mount, float32 noise shifted nominally coplanar sphere equators by a
few micrometers. Restoring their known common plane and radius made the union
valid. Record this correction; arbitrary rounding can change functional fit.

## Cross-sections and edge treatment

For an extruded panel with rounded edges, inspect sections across its thickness.
Align boundary landmarks consistently and resample each boundary uniformly before
fitting splines. Dense, uneven mesh vertices can produce self-intersecting fits.
Shared cubic knots reduce complexity across sections. Constrain endpoints and
measure residuals rather than accepting a spline just because it looks smooth.

Do not smooth across a discontinuity. A globally smooth loft overshot the
pump holder's abrupt joint step. Ruled bands preserved the step but left small
local shape differences; those need their own comparison and fit review.

Operation order matters. The feet could accept their full edge fillets before
small mating bevels were cut. Applying those fillets after the bevels failed.
Preserve contact surfaces and required clearances when choosing edge treatment.

## Verification details

Use the kernel's adaptive volume integration for fitted B-spline solids. In the
CadQuery/OpenCascade recovery, `Volume(1e-7)` agreed with Freac; default quadrature
was wrong by thousands of cubic millimeters. Volume alone cannot detect a filled
notch or misplaced hole.

Weld tessellation vertices by spatial distance, not just rounded coordinate bins.
The recovery used 1e-7 mm, removed triangles with repeated vertex indices, and
then checked closed, consistently oriented meshes. Float32 export/reload can
collapse tiny edges, so retain double precision during validation. Never fill
holes silently just to make a mesh pass.

Compare source-to-recovery and recovery-to-source. Most of the pump panel agreed
within 0.04 mm, while small patches around its tubing catch and joint transition
were much farther away. Inspect those patches before treating a reconstruction
as a print replacement. Check joint collisions separately from surface distance.
