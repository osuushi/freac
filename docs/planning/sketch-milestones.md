# Sketch milestone acceptance

Original planning/reference material; old next-step language is not authorization.
This is historical planning, not a current work queue. Cubic editing supersedes
the original spline exclusion.

## Sketch v1

Each stage consists of short, integrated changes and coherent commits. These are
user outcomes, not assignments to build separate frontend/backend layers. A new
drawing tool must also support selection, moving and editing on delivery.

| Stage | Usable result | Review/exit condition |
| --- | --- | --- |
| **S0 — Setup and shared world** | A reproducible Node/npm launch, light viewport, clear origin and X/Y/Z axes, faint infinite XY/XZ/YZ grids; explicit plane entry and orbit back to 3D | Verify fresh setup and clean shutdown. Grids and existing geometry stay aligned through zoom, pan and plane changes. Engineering prerequisite; continue to S1 without stopping for a blank-canvas review. |
| **S1 — Basic drawing that is actually editable** | Lines and rectangles; point/edge/group selection and multiselection; move, every-edge/every-corner resize, rotate, Delete, Clear, Undo/Redo; local dimensions and snapping with Option/Alt bypass | **First hands-on review.** Draw several shapes, move them together, resize from left/top after reselection, edit a rotated rectangle, leave/re-enter XY/XZ/YZ. Shapes stay put in the same world and survive dismissal. |
| **S2 — Curved profiles and constraints** | Circles and editable arc segments; connected line/arc chains; local radius/length/angle inputs, Tab, geometric constraints and explicit dimension locks | Draw a rounded profile, move arc endpoints/centers, set tangency and dimensions, move a width-locked rectangle, and recover from a conflicting constraint. Use the real solver. Review before adding more curve modification tools. |
| **S3 — Useful compound sketches** | Trim, split, extend, offset, construction geometry, selectable closed regions with holes; Save/Open | Make a plate outline with holes and a slot, trim crossing line/arc geometry, offset the outline, Undo/Redo, save/reopen and keep editing. Nested/disjoint cells work; one bad remnant does not disable unrelated profiles. |
| **S4 — Finish the v1 toolkit** | Ellipses, copy, mirror, uniform scale, linear/circular repetition, sketch fillets/chamfers and sketch-to-sketch projection | Deliver each tool with its own short interaction brief and runnable increment. Review a repeated hole layout and an arc/ellipse-based profile. All new geometry supports applicable editing, constraints, trim, region formation and saving. **No splines.** |
| **S5 — Sketch v1 acceptance** | A dependable sketch editor for real drawings, with the above tools working together | Founder completes the three tasks below. Fix workflow defects and document platform evidence. **Sketch acceptance is the gate to solid-tool implementation.** |

The first S0/S1 implementation increments are:

1. Make setup/launch reproducible and establish the shared origin/grid/camera scene.
2. Draw and reselect a rectangle; move it and resize it from all sides/corners,
   with live local dimensions and one Undo step per edit.
3. Add line editing, multiple-shape selection/transforms, rotation and complete
   the exit/re-entry/Delete/Clear route. Verify through actual controls, then review.

S1 is an early product checkpoint, not “sketching finished.” S2 is similarly
delivered as circle editing, arc/connected-path editing, and constrained editing
increments. S3 delivers curve rewrites and regions together in runnable portions.
S4's tools are implemented individually; its inventory is not a single assignment.
No fixed field panel or separate sketch canvas is an acceptable shortcut.

### What the first review must show

The world origin and axes are recognizable before entering a sketch, while
editing, and after orbiting out. Coordinate planes appear unbounded and faint,
with an active-plane emphasis. Zoom changes grid density without moving the
origin or changing coordinates. Grids cannot hide geometry or steal geometry
clicks. Camera alignment maintains spatial context rather than teleporting to an
unrelated 2D editor. The same test is repeated on XZ and YZ, not just XY.

Move two rectangles and a line as a selection. Reselect a rectangle and resize
its left edge, top edge and each corner with the advertised opposite anchor.
Rotate it and repeat. Type a dimension, Tab, dismiss the controls, orbit away,
return, Undo/Redo, Delete and Clear. This is the first useful stopping point.

### Sketch acceptance tasks

1. **Mounting plate:** dimension an outline, round/chamfer sketch corners, create
   and repeat holes, move the hole selection, resize the outline from left/top,
   constrain spacing, save/reopen and continue editing.
2. **Curved bracket profile:** join lines and arc segments with tangent transitions,
   add an internal slot, trim crossing geometry, offset a chain, select the closed
   cells, Undo/Redo and recover from a conflicting constraint.
3. **Layout across planes:** use arcs/ellipses, mirror or repeat geometry, rotate
   and dimension it, project between sketches, and move between planar and 3D
   views without losing orientation or work.

Routine verification uses headless Chromium/WebKit and real geometry. Check the
Electron host at product checkpoints. Begin physical iPad selection/gesture/field
feedback once S1/S2 are usable, rather than waiting for solid tools. Verify Linux
and Windows builds of the sketch app and its required components before claiming
those targets; record unavailable environments as gaps, not passes. Functional
sketch review and platform acceptance are tracked separately. No new remote or
agent infrastructure is needed to run these checks.
