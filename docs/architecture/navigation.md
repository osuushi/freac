# World navigation

Read for work in this area, not on every resume. [Architecture index](../architecture.md).
Later founder decisions override earlier proposals.
Cubic editing/projection (2026-09-16) supersedes any earlier spline exclusion.

### Canonical plane entry

In Modeling, a single click on an implicit canonical plane clears selection through
the ordinary canvas selection route. Double-click enters its sketch workspace.
Explicit plane-selection modes continue to accept a plane on a single click.
In Mirror and Projection, a nearer planar solid face takes precedence over a
canonical patch behind it; a coplanar face wins the depth tie.
Keyboard/tool-menu plane entry remains available.

### Sketch tool lifetime

Leaving a sketch workspace resets its tool to Select and clears armed creation
intent. Reentering a sketch or choosing another plane therefore starts in Select,
without inheriting Circle, Line, Rectangle, Curve or Trim from the previous session.
Drawing tools continue to take precedence while that session is active. Explicitly
choosing a drawing tool in Modeling can still arm a new plane-first drawing flow.

### Sketch-plane visibility

While a planar workspace is active, renderer clipping makes geometry on the
camera side of its plane absent from the main pass. Bodies and their edges on
that side render into a separate depth-tested buffer, clipped at the same plane,
and composite over the main scene at 20% opacity. Overlapping foreground bodies
therefore do not accumulate transparency. Sketch curves and grids do not enter
this foreground pass. Coplanar and behind-plane geometry remain normally visible;
a 0.0001 mm rendering tolerance retains coplanar geometry.
The cutaway follows the current workspace frame and camera side, and clears on
workspace exit. It changes no accepted geometry, selection identity or Undo.

### Orthographic camera depth

Zoom changes the orthographic view size. Before rendering and queued navigation
picking, place the finite camera behind the bounds of visible document/preview
geometry, with a small depth margin, and extend the far limit when necessary.
Retreat only along the viewing direction: screen positions, view size, orientation,
target and rotation pivot stay unchanged. Keeping geometry ahead of the camera
also preserves forward ray picking; a negative near limit alone would not do that.
Bounds cache by displayed document and visibility, conservatively enclosing body
bounds and sketch curves on tilted planes. World origin and visible construction
plane origins also participate. Infinite grids do not determine scene bounds.
Intentional sketch cutaway and cross-section planes remain independent.
Camera-to-target distance is rendering placement, not the orthographic zoom scale.

### Rotation pivot

Mouse-down, cube press and the initial one-finger touch contact supply viewport
coordinates. Hover and selection do not drive acquisition. At drag activation,
ray-cast through that press location and use the frontmost visible surface hit.
If the ray misses, find the nearest projected point on a visible surface, then
cast a new ray there to resolve occlusion. Distance is in screen pixels, including
non-square viewports. Projected body bounds order and prune the search; clipped
render triangles supply the actual nearest point, so holes are not filled by
bounding-box approximations. A subpixel inward offset stabilizes contour rays.

Hidden entities, clipped geometry, offscreen portions, grids and plane widgets
cannot attract the pivot. Resolve before leaving the sketch workspace. If there
are no visible surfaces, use the closest visible curve/edge point for wire-only
work; a completely empty view retains its target. This replaces the earlier
selection-bounds and central-20% sampling rules.

Freeze the pivot throughout the drag and rotate both camera position and view
target about it, preserving the pivot's screen location and reversibility. Release
leveling retains the view-axis roll behavior described below. Cube face
clicks retain their existing view target. These are transient camera decisions,
with no model edits or document Undo entries.

### Smoothed Shoemake turntable with release leveling

Command/Meta + primary drag uses a screen-centered control radius of half the
smaller viewport dimension. A press stays pending until movement exceeds the
selection drag threshold; a completed Command-click toggles selection without
exiting the sketch. Escape or window blur cancels a pending press. A press inside
70% of the radius uses a turntable: horizontal motion yaws around the signed
world X/Y/Z axis selected by the release-leveling score, and vertical motion
pitches around the starting camera-right axis. Its horizon stays level during
small drags from an already level view. A press beyond 115% of the radius uses pure
view-axis roll, with twice the angular travel of the pointer around the viewport
center, retaining the outer-ring response of Shoemake's Arcball. Between 70% and
115%, cubic smoothstep blends the turntable and roll angles. The press chooses the
blend for the whole drag, so moving across the band does not change the grip
mid-gesture. The pointer-down point, camera pose, upright axis and pivot stay fixed
throughout the drag. The ring angle unwraps through a full circle without a jump;
reversing the pointer path restores the starting pose. Every completed orbit drag
levels on release, including pure center drags.
The ring angle follows the geometry in [Shoemake, Arcball (1992), pp. 152–155](https://graphicsinterface.org/wp-content/uploads/gi1992-18.pdf);
the implementation is independent and no upstream code is copied.

On pointer-up, score each world X/Y/Z axis by `rollRadians² - 0.25 × ln(projectedLength)`.
Projection length is that of a unit axis on screen. This smoothly penalizes
foreshortening, with infinite cost only at exactly end-on; no eligibility threshold.
The weight makes a half-length projection cost roughly as much as 24° of roll.
Choose the lowest score and put either sign of that axis exactly vertical.
Discrete axis selection still has decision boundaries; orientations are not blended.
Animate over 280 ms with cubic ease-out, or immediately with reduced motion. Viewing direction, pivot, distance
and zoom stay fixed; only roll changes. New navigation interrupts the animation.
Cancellation, Escape and focus loss end the drag without snapping. Releasing Command
mid-drag retains capture. Capture blocks editing, trailing clicks and wheel/pinch.
Camera changes never modify the document or Undo. Native trackpad rotation gestures
remain deferred; tablet one-finger orbit uses the same press-based pivot through
pointer events. Sketch entry retains its existing transition.

The temporary rotation circle, endpoint markers and diagnostic caption are hidden.

### Control preference and trackpad navigation

The header Control popover has exclusive Trackpad and Mouse choices, remembered
locally with Trackpad as the default. Below a separator, Tablet invokes the existing
desktop handoff; it is an action, never a stored control mode. Browser-only windows
show that action disabled. These preferences do not enter the document or Undo.
Mouse mode maps ordinary wheel input to pointer-anchored zoom and Shift-middle
drag to the existing orbit gesture. Middle and secondary drags still pan. Command
orbit and pinch remain available in either mode. There is no automatic device
classification. A middle press without a drag never replays a selection click.

Two-finger scrolling pans without leaving the sketch plane. Command-click-and-drag
invokes turntable/ring rotation and exits sketch mode.
Two-finger click-and-drag (secondary-button drag) pans.
Pinching zooms about the pointer. Pan and zoom retain the current sketch plane;
orbit exits sketch mode. Camera edits never alter document geometry or Undo.
Middle-button drag remains a mouse pan fallback. The founder selected
secondary-button pan after the three-finger DOM input experiment; no native
trackpad integration or Shift-scroll fallback is needed for this mapping.

See [Electron's swipe API](https://www.electronjs.org/docs/latest/api/browser-window#event-swipe-macos)
and the [WheelEvent fields](https://developer.mozilla.org/en-US/docs/Web/API/WheelEvent)
for this input limitation. Founder experiment in the running app (2026-09-14): the attempted two-/three-finger
gestures were reported as scroll events, not distinct touch contacts. This is a
founder-observed result; no raw capture has been reviewed. The temporary Input
experiment pad recorded per-gesture DOM events and exported JSON (commit `0d75c88`);
it was removed after the mapping was settled. Recorder/export
checks pass in Chromium, WebKit and hidden Electron; synthetic touch coverage
checks recorder fidelity only, not hardware delivery.

The input adapter handles [wheel events](https://developer.mozilla.org/en-US/docs/Web/API/Element/wheel_event)
with Ctrl for browser pinch and WebKit's [gesture scale events](https://developer.mozilla.org/en-US/docs/Web/API/GestureEvent).
Active WebKit gestures suppress duplicate wheel handling. Scale-only events use
the last pointer position, or viewport center if none exists. Automated tests
exercise pointer/wheel input and synthetic gesture-scale events; they do not
establish physical trackpad or iPad touch behavior.

### Orientation cube

The upper-right cube follows the current camera. Drag with the primary pointer to
use the same turntable/ring rotation and release leveling as Command-drag; a face click
aligns Front (−Y), Back (+Y), Left (−X), Right (+X), Top (+Z), or Bottom (−Z).
The white/near-black cube has six inset labeled faces, twelve edge bevels and eight
corner bevels. Labels are projected in each face plane, rotating and foreshortening
with the rigid cube. Edge clicks align to the equal-weight diagonal of their two
axes (flat 45°); corner clicks align to the equal-weight three-axis isometric view.
Bevels have tooltips and accessible names but no visible labels.
A face click from an oblique view chooses the nearest of its four quarter-turn
orientations, avoiding an unnecessary roll. Clicking an already face-aligned view
again resets it to canonical roll. Canonical side and diagonal views keep Z upright;
canonical Top uses +Y up and Bottom uses −Y up. Bevel views retain canonical roll.
All visible surfaces support Tab and Enter/Space. Alignment animates over 280 ms
with cubic ease-out, using the shared camera transition. Reduced motion applies
the orientation immediately; subsequent navigation interrupts the animation.
Navigation retains the view target, distance
and zoom, and exits the planar workspace. It creates no geometry edit or camera
Undo step; normal sketch exit still clears selection through selection history.
Pointer capture retains drags outside the cube; Escape, cancellation and focus
loss stop without leveling. Active modeling gestures block cube navigation.
