# Extrusion draft

Read for work in this area, not on every resume. [Architecture index](../architecture.md).
Later founder decisions override earlier proposals.
Cubic editing/projection (2026-09-16) supersedes any earlier spline exclusion.

## Extrusion draft (founder request, 2026-09-16)

The local Extrude widget has a Draft value and an Angle (°)/Offset (mm) dropdown.
Offset means displacement per wall at the far end, not total width/diameter change.
Positive draft expands material away from the fixed source boundary; holes narrow.
The sign convention stays the same for either extrusion direction.
Switching units preserves the shape using `offset = abs(length) * tan(angle)`.
Subsequent length edits hold the selected quantity fixed. Nonzero draft cannot be
converted at zero length; set a nonzero length first. Angles must lie strictly
between -90° and 90°. Collapse, split boundaries and colliding walls are errors
with recoverable input, never a silent undrafted result.

Draft belongs to the temporary Extrusion request. Straight/circular boundaries
use kernel parallel contours and ruled solids, with holes cut separately; other
curves use OCCT's draft sweep to the end plane. General curves use the kernel's
surface approximation tolerances; they are not polygon replacements. Zero draft
retains the ordinary prism path. Accepted bodies remain materialized geometry,
with no extrusion recipe or permanent relation to the source sketch. Boolean
mode, target selection, completion/cleanup and single-step Undo are unchanged.

## Twisted extrusion (founder request, 2026-09-21)

The founder requested twist as part of Extrude, combined with existing draft.
The axis is normal to the source face/sketch plane; a Move-style sphere positions
its intersection with that plane. It is available at zero twist, before any
expensive twisted calculation. Moving this zero-twist anchor changes tool state
only, with no geometry calculation or document Undo entry.

Controls are Length, Twist (signed total degrees), and the existing Draft
angle/offset controls. Twist accumulates uniformly from the unchanged source to
the far cap, including angles beyond one turn. Positive rotation follows the
right-hand rule about the source normal; signed length chooses the extrusion side
independently. The sphere stays on the source plane; a faint axial guide connects
it to the displaced plane. A rotation glyph controls twist about that axis. Its
center stays 72 CSS pixels left of the sphere in screen space, independent of
zoom and camera orientation; its location has no geometric meaning. The glyph
retains its plane orientation and hover glow, without a rectangular hover fill.

Anchor dragging uses the source plane regardless of camera orientation and may
place the axis outside the profile. Reuse Move's visible point-of-interest feedback
and Command bypass, but accept only snap positions in the source plane. Do not
let an off-plane snap silently tilt or displace the axis. Exact edge-on placement
requires orbiting to expose the plane. Anchor placement precedes twist and remains
available while editing a twisted candidate.

Draft retains its current meaning: parallel contour expansion/contraction through
the height, then rotation about the chosen axis. It is not scaling about that
axis. Positive draft grows outer boundaries and narrows holes. On twisted walls,
the displayed draft angle specifies contour growth per axial distance, not a
constant physical wall inclination. Zero twist retains the existing geometry path.

The founder chose live previews, with cancellation and recalculation whenever
inputs change. Pointer movement, numeric input, navigation and repainting must
remain responsive during calculation. Immediately invalidate and cancel obsolete
work; retain only the newest complete parameter set, not a queue of intermediate
targets. Start that calculation as soon as the old native call releases its slot.
An obsolete reply cannot publish a preview, an error, or an acceptable candidate.
This uses the current interaction's temporary request ownership, not public document
revisions or concurrent document mutation. The last valid solid may remain visible,
clearly pending while it differs from the controls. Acceptance waits for the newest
valid result and remains cancellable. Escape cancels pending and running work.
Existing atomic rollback and one-step acceptance remain authoritative.
Repositioning a nonzero-twist axis changes the candidate geometry, unlike Move's
UI-only anchor. Canceling that gesture restores the previous axis and candidate.

Eligibility is profiles/faces in one common plane, sharing one positioned axis;
ordinary untwisted extrusion eligibility remains unchanged. The kernel builds
rotated sections through the height and adaptively refines the loft. Compatibility
optimization is disabled so it cannot undo the requested turns. Independent
mid-station contour samples check the loft shell; closed-solid validity,
self-interference, contour nesting and hole collisions are checked separately.
Topology-changing offsets and sweeps that cannot meet these checks reject
recoverably, leaving the accepted document intact.

### Cubic approximation budget (founder decision, 2026-09-21)

Cubic Béziers favor intuitive editing over exact representation of every shape.
For this hobbyist/3D-printing toolset, the founder accepts deviations up to
0.001 mm. Twisted extrusion uses this as its general-curve approximation target,
not a global relaxation of topology or source-plane tolerances. Analytic contour
checks retain 1e-6 mm. The curved loft check allows 0.0005 mm, leaving room for
the existing draft sweep's approximation and section reparameterization.
Finite sampling is a practical acceptance check, not a certified continuous
maximum-error bound for arbitrary profiles.

Source cubics enter OCCT as exact Bézier curves. Its loft converts them to
B-splines; conversion itself does not require approximating a cubic. Drafted
curved sections come from the existing draft sweep, then receive approximate
arc-length parameterization so corresponding points progress consistently along
the loft. Their shared vertices and existing sewing tolerances are retained.
The accepted source sketch is untouched. There is no blanket cubic-plus-draft
exclusion.

## Outstanding regression checks

The broader extrusion UI route has an unresolved circular-cut volume mismatch
(2748.67 versus 2858.63). The adjacent overlapping-circle screw route also fails
its volume assertion with the baseline kernel (35153.167 versus 27950.133).
Their later checks remain unverified; focused twist passes do not close these gaps.
