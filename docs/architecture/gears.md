# Involute gear decorator

2026-09-27. Pitch-surface interaction approved by the founder and implemented.
The tool supports external/internal cylinders, conic bevel faces and planar racks,
including disconnected partial faces. Helical means cylindrical helicals and
inclined racks; conic gears use straight spherical-involute teeth.

## Interaction and ownership

Select faces and invoke **Gear**. The selected geometry represents the pitch
surface, not the tooth-tip blank. Teeth add and remove material around it.
The accepted BRep remains unchanged; the existing decorator compositor previews
teeth and the export worker applies closed mesh operands for STL/3MF.
DocumentOwner owns settings and attachment state with snapshot Undo. There is
no gear-set object, persistent mating relationship or chain solver.

The panel supplies integer teeth per revolution (initially 40), normal pressure
angle (20 degrees), helix angle/hand, phase, normal tooth thinning, root-clearance
coefficient and profile shift. Tooth count refers to a complete revolution even
on a sector. The normal module is derived from pitch radius, count and helix.
Rotary phase is degrees. Thinning is millimeters in the normal section, applied
once per gear, not a pair-wide backlash automatically applied to both parts.
Root clearance is a dimensionless module coefficient, initially 0.25.

Racks expose normal module (initially 1 mm), numeric in-plane travel direction,
linear phase in mm and tooth inclination using the helix/hand controls. The
saved plane frame defines zero direction independently of the camera. The trimmed
extent clips a repeating profile. Rotary count and phase controls are hidden
for racks; helix/hand are hidden for bevels. Mixed selections patch only instances
to which a field applies. Numeric typing previews; Enter/blur accepts and Escape
cancels. Reselection, continuation, partial removal and repair share the existing
decorator routes. A face still has at most one active decoration.

**Resize to module** on one cylindrical instance reports the required radius,
previews a native face offset, then explicitly accepts or cancels it. Acceptance
is one geometry Undo step; count and settings remain fixed and the displayed
module follows the new radius. Clamped or otherwise unachievable target radii
cannot be accepted by this control. Applying Gear alone never resizes geometry.

## Support and continuity

Partition by body, analytic support and material side. Cylinders share radius
and axis line; opposite parameter-axis signs are equivalent. Cones share apex,
axis, opening angle and nappe. Rack faces share plane and oriented material side.
Native face presentation and agent inspection expose cone apex, direction,
semi-angle in degrees and material side; analytic metadata is derived from BRep.

Save a reference frame, settings and support kind/material side. Cones also save
an axial reference range at application; its far section defines the reported
module and physical thinning. Partial removal does not change that reference.
Rigid transforms carry the frame; copies receive independent instance IDs.
Scaling preserves integer count, angles, phase, clearance/profile coefficients
and physical thinning, deriving module from the resized support. Reflection
preserves configured hand. Ineligible surface changes and ambiguous merges become
unresolved. Explicit reassign establishes a new frame/reference section.

Use immediate topology correspondence to retain compatible split descendants.
Never restart phase at face seams or gaps, or merge independent instances after
an edit. Trim each selected patch independently, including holes and separated
axial domains. Existing adjacent-plane/cylinder clipping keeps modifiers out of
unselected boundaries. General arbitrary curved-neighbor extension remains the
same limitation as the thread domain pipeline.

## Geometry and calculation affordances

Cylindrical profiles use involute flanks with explicit root/tip transitions.
Helical lofts rotate cross-sections by z*tan(beta)/pitchRadius, with the chosen
hand. Racks use the matching normal-system straight flank profile. Roots below
the base circle connect radially; generated cutter trochoids/root fillets are
not implemented. Combinations requiring undercut, pointed/overlapping teeth or
internal tips below the base circle reject with a reason.

Bevel profiles use a spherical involute of a base cone, not a stretched planar
involute. With pitch semi-angle delta and pressure alpha,
sin(deltaBase) = sin(delta)*cos(alpha). A great-circle tangent unwrapped from
that base cone gives the flank azimuth. Teeth follow rays from the common apex.
Coverage must stop before the apex; supported semi-angles are 3–80 degrees.
Spiral bevels reject explicitly. Sampled 1:1, 90-degree bevel engagement is checked;
this is not universal pair compatibility or a manufacturing-standard certification.

Agent `decorators()` lists the built-in `freac.gear` v1 schema. `inspectDecorator`
returns resolved rotary module, pressure angle, pitch/base/tip/root dimensions,
lead and support/frame information. Its optional `normalModule` returns
`requiredPitchRadius` without editing geometry. Cone results include the saved
reference section and cone angles. Transverse pressure and half-width results
are radians; user settings use degrees. Original face domains remain available
through ordinary geometry inspection.

For cylinders, d = z*mn/cos(beta), mt = mn/cos(beta), and
tan(alphaT) = tan(alphaN)/cos(beta). Unshifted external reference center distance
is r1+r2; internal reference distance is rRing-rPinion. Rack transverse pitch is
pi*mt. Profile-shifted pairs require operating-distance calculations. Positive
profile shift moves the generating reference outward: it thickens external
teeth and widens internal tooth spaces. The same exact calculations supply panel
readouts and agent inspection. Agents can `replaceFace`/`offsetFaces`, move bodies
and `editDecorator` within one awaited script transaction and one Undo step.

Export sampling uses the minimum of 0.004 mm, smallest normal module/100 and
positive thinning/8, with a 0.00001 mm floor. Preview uses a coarser profile.
Numerical Boolean precision and tessellation error remain separate from intended
thinning/clearance. Export retessellates a read-only snapshot, retains closed-mesh
validation and does not mutate accepted data. Long jobs use existing worker status
and cancellation. Bounded sampling and pair probes are not a general proof of
maximum deviation or physical fit.

Mathematical references: [KHK gear dimensions](https://khkgears.net/gear-knowledge/gear-technical-reference/calculation-gear-dimensions/)
and the published [spherical-involute equations](https://journals.sagepub.com/doi/10.1177/16878140211037120).
No upstream implementation code was copied.

## Verification and limits

`tests/gears-ui.mjs` exercises real pointer/keyboard creation, gear/rack/bevel
settings, numeric cancellation, explicit radius resize, Undo/Redo, reselection,
removal, save/open, previews and STL/3MF downloads in headless Chromium/WebKit and
hidden Electron. Native tests cover internal/external and helical export,
disconnected sectors/axial patches, continuation, copied placement, agent dimension
inspection and atomic geometry/settings scripts. Engagement tests sample spur,
opposite-hand helical, internal, rack/pinion and straight-bevel pairs.

The separate [agent gear-train evaluation](../development.md#gear-train-behavioral-evaluations)
exercises fresh agents building pairs/compound spur trains and relocating an existing
axis. Its geometric grading and ordinary re-editing checks evaluate the resulting
models; transcripts separately establish what the agent actually verified.

These checks do not establish arbitrary gear-chain interference, assembly, load
capacity, physical printer fit, or iPad input. Agents remain responsible for
choosing and checking a particular arrangement; the tool saves independent gears.
