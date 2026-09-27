# Knurling decorator

Knurling (`freac.knurling`, version 1) is a built-in export-time mesh decorator.
Select one or more analytic cylindrical faces and invoke **Knurling**. Full and
trimmed cylinders, including internal faces, use the same diamond definition.
Mixed incompatible geometry rejects atomically. The original exact solid stays
unchanged; STL/3MF contains the knurling. STEP retains the original solid.

## Interaction and ownership

The decorator panel offers a preset, Recessed/Raised, spacing and depth. Numeric
edits preview, Enter/blur accepts one Undo step, Escape cancels. Editing expands
selection to all affected instance members. Reselect the original faces to edit;
preview meshes cannot intercept picking. Multi-selection uses Mixed values and
field-only patches. Remove knurling affects only selected members. Continue
knurling extends a compatible instance; independent cylinders remain independent.
One decorator per face remains the shared contract.

The DocumentOwner owns settings and attachments. Save/open and Undo/Redo preserve
them without code enablement. Compatible face descendants inherit the cylinder
frame; unrelated generated faces do not. Moves/copies transport the frame; uniform
scale retains physical requested spacing and depth, recomputing the repeat count.
Non-cylindrical results remain unresolved and block export pending repair/removal.

## Pattern and presets

Two opposite 45-degree diagonal waves form diamonds with flattened tops. The
requested spacing is an approximate circumferential repeat distance, in mm.
Round circumference/spacing to the nearest integer, at least three repeats;
actual spacing and axial period both equal circumference/repeat count. Display
these resolved dimensions. This closes the angular seam, including on partial
faces. Phase comes from the saved frame, never the surviving face's parameter seam.
The top occupies 35% of the repeat width along an axial or circumferential section
through its center. The peak-to-valley radial depth is explicit.

| Preset | Requested spacing | Depth | Starting assumption |
| --- | --- | --- | --- |
| Fine (default) | 2.4 mm | 0.4 mm | 0.4 mm nozzle, 0.2 mm layers, upright cylinder |
| Coarse | 3.6 mm | 0.6 mm | 0.6 mm nozzle, 0.2 mm layers, upright cylinder |

These are Freac design heuristics, not published printer qualifications. The flat
tops are approximately two nozzle widths across before seam adjustment, with
radial depth spanning two/three assumed layers.
[Prusa's modeling guidance](https://help.prusa3d.com/article/modeling-with-3d-printing-in-mind_164135)
explains nozzle/extrusion-width limits. It does not validate these knurls.
Use a printed sample, especially for horizontal axes or different materials.

Presets save concrete values. Choosing a preset resets spacing/depth; explicit
values in the same edit win. Editing either dimension marks Custom. Changing
relief keeps the preset. Geometry edits do not silently reapply presets.
Older files using `fdm-fine` or `fdm-coarse` reopen as Fine or Coarse. The
retired resin preset reopens as Custom with its saved dimensions unchanged.
Recessed removes material and keeps the nominal cylinder envelope. Raised adds
material into the free side: outward on rods, inward on holes. Neither shifts
or offsets the original BRep. Deep recesses can pierce thin walls; this first
version does not certify wall thickness or physical grip/printability.

## Generation and limits

Preview and export share one radial definition. The parameter grid splits at
both diagonal wave corners, their intersections and flat tops. Classification
snaps near-zero phase differences before splitting, avoiding spurious unmatched
edges at coincident pattern boundaries. Cylinder shells and existing trimmed
face masks bound modifications, including adjacent planar/cylindrical boundaries.
The shared decorator limitations for complex neighboring surfaces still apply.

Export retessellates the read-only body at 0.004 mm and applies closed differential
shells with the existing numerical packing/validity checks. This tessellation
setting is not a blanket error certificate for every exported knurl facet.
Preview is coarser. Generation is bounded to 100,000 initial grid cells per instance;
excessive density/length reports a mesh-budget error instead of silently reducing
export detail. Worker cancellation and export failure preserve the document.

The first version is diamond-only, full selected-face coverage, without axial
inset/taper or user phase/angle controls. Physical printing and iPad touch acceptance
require device testing.
