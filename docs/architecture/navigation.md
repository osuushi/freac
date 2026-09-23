# World navigation

Read for work in this area, not on every resume. [Architecture index](../architecture.md).
Later founder decisions override earlier proposals.
Cubic editing/projection (2026-09-16) supersedes any earlier spline exclusion.

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

### Arcball with release leveling

Command/Meta + primary drag uses a screen-centered virtual hemisphere with radius
half the smaller viewport dimension. A press stays pending until movement exceeds
the selection drag threshold; a completed Command-click toggles selection without
exiting the sketch. Escape or window blur cancels a pending press. The inner 80% uses the hemisphere mapping;
the outer 20% tapers its polar angle with cubic Hermite interpolation, matching
the inner slope and reaching the equator with zero slope. Outside points project
to the equator for pure roll. This independently implemented taper follows the
rounded-Arcball idea in [Shambaugh’s taxonomy](https://theshamblog.com/virtual-trackballs-a-taxonomy-and-new-method/),
not its source code. It smooths the radial response without time filtering or lag.
The pointer-down point and camera pose stay fixed throughout the drag. The free
rotation uses Shoemake's half-angle arc quaternion (cross product, dot product),
applied inversely to the camera. No model raycast, axis inference or constraints.
This is an independent implementation of the mathematics in
[Shoemake, Arcball (1992), pp. 152–155](https://graphicsinterface.org/wp-content/uploads/gi1992-18.pdf);
no upstream code is copied. Returning to the starting pointer restores the starting pose.

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
Camera changes never modify the document or Undo. Native trackpad/iPad rotation
remain deferred. Sketch entry retains its existing transition.

The temporary Arcball circle, endpoint markers and diagnostic caption are hidden.

### Trackpad navigation

Two-finger scrolling pans without leaving the sketch plane. Command-click-and-drag
invokes Arcball rotation and exits sketch mode.
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
use the same Arcball rotation and release leveling as Command-drag; a face click
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
