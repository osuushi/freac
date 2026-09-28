---
name: mesh-recovery
description: Recover editable CAD solids from an attached 3MF mesh in Freac. Use when reconstructing mesh parts and checking the resulting solids against their source geometry.
---

# Recover CAD from a 3MF

Attachments are reference copies in `attachments/` within this drawing's
workspace (earlier trial drawings may use `attachment-*/`). Read the requested
file there and retain it for comparison. Attaching a
file does not add geometry to the drawing.

Start with `freac status`, `freac inspect`, and `freac types`. These describe the
current drawing and the supported modeling operations. Use `freac run` for changes
so they participate in Undo. Read `freac docs` for unfamiliar operations. Do not
rewrite the live drawing archive or private application files to import geometry.

## Inspect first

Run `python3 scripts/inspect_3mf.py FILE` relative to this skill directory (or use
`python` if that is the installed interpreter). The helper uses only the Python standard library and
reports bounds in millimeters, triangle counts, names, transforms and mesh topology.
It supports meshes and nested components in the main model. If it reports an
unsupported extension, inspect that extension explicitly before reconstructing.
Never silently drop component instances or flatten their transforms incorrectly.

Look for existing CAD or generator sources before fitting a mesh. Record the
source, units, part quantities and assembled placements. A slicer project can
include meshes, print arrangements and settings; none implies a feature history.

## Reconstruct

Read [the recovery procedure](references/recovery.md) before fitting curves or
fillets. Recover one distinct solid per printable part using analytic features
where supported. Use the drawing's supported typed API for sketches, extrusions,
booleans and blends. Read `freac types` rather than inventing an import command.

If a required surface operation is unavailable, report that specific gap. An
external CAD kernel can produce a separate candidate when the user wants that
route, but a private archive encoder tied to one Freac build is not a general
import interface. Never claim an external candidate has been imported into the
current drawing until the application accepts and displays it.

## Compare and hand over

Check solid validity, part count, bounds, functional holes, joint clearance and
assembled collisions. Compare sampled surface distances in both directions and
report median, 95th/99th percentiles and the largest sampled deviation. Sampling
can miss larger deviations. Check local outliers even when volume agrees.

Keep a concise workspace note with the source, reconstructed features, measured
differences and remaining fit questions. State whether original feature history
was recovered. Deliver distinct named solids and, when exporting for printing,
one 3MF containing all required parts. Identify geometry-only exports that need
arrangement and slicing. A valid CAD solid does not prove physical fit or strength.
