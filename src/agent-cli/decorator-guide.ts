export const decoratorGuide = `
## Authoring bundled JavaScript decorators

A definition has id, version (positive integer), name, fields, source and optional
preview:true. IDs use letters, digits, dots, underscores and hyphens; freac. is
reserved. Source is one self-contained ES module with a default-exported object.
Its synchronous hooks are:

- partition(context): return {groups:[{faces:[{body,face}],state?}]} or {reason:string}.
  Cover every selected face exactly once, with one body per group. state is optional
  JSON continuity data, at most 64 KiB. Return updated state explicitly to preserve
  it across partition calls. To reject Continue, return a useful reason or more
  than one group; the host only continues when the union forms one group.
- validate(context): return [{severity:"warning"|"error",message,faces?}]. Highlighted
  faces must exist in the selected bodies. Errors block application/generation;
  warnings remain visible in the settings panel. At most 100 diagnostics.
- generate(context): return [{operation:"add"|"subtract",mesh}]. Each modifier is a
  closed, consistently oriented triangle mesh; the array may be empty. The host
  applies these modifiers to the original body mesh at STL/3MF export.
- preview(context): optional when preview:true; return one triangle mesh or null.
  Open meshes are allowed. Preview is translucent and never replaces picking on
  the original exact faces. Prefer a coarser mesh than export.

A mesh is {vertices:[[x,y,z],...],triangles:[[i,j,k],...]}, with world millimeter
coordinates and zero-based integer vertex indexes. Reject degenerate triangles;
use consistent outward winding. Each mesh is limited to one million vertices and
two million triangles; generate returns at most 100 modifiers.

Every context has units:"mm", selection:[{body,face}], bodies, instance and resolved
settings. instance contains id, definition, version, faces, settings, frame and
optional state/problem. frame is {origin,u,v} with world-space vectors. The host
transports it through modeling moves and copies; use it for phase continuity.
bodies includes each selected body with id, volume, center, bounds, faces and edges,
but no opaque BRep string or kernel handles. bounds is [minX,minY,minZ,maxX,maxY,maxZ].
Each face has id, edges (edge IDs), vertices (flat triangle coordinates, nine numbers
per triangle), plane (frame or null), optional cylinder {origin,axis,radius,outward},
and optional offsetHandle {center,normal}. cylinder.outward is +1 for an exterior
surface or -1 for an interior surface; a plane's u/v cross product alone need not
be its outward normal. Edges have id, points (flat polyline coordinates), and curve
(line with a/b, arc with a/b/mid, circle with center/normal/radius, or null).
Preview/export also supply quality:"preview"|"export" and tolerance in millimeters
(currently 0.08/0.004). These are sampling suggestions, not fit allowances.

Fields are declarative number or enum controls. Give every field key, label, type,
and default; numbers can specify min/max/unit, enums require options with value
and label. visibleWhen:{key,values} controls conditional display. Mixed selection
edits update the chosen field for all selected instances. Unknown fields and
out-of-range settings reject. Up to 32 fields, 64 definitions and 256 KiB source
per definition are allowed. Source and state are saved in the Freac document.

Hooks run in a fresh isolated JavaScript VM with JSON input/output. No imports,
DOM, file, network, timers or host APIs are exposed. Bundle helpers into source.
No promises or global state surviving calls; use instance.state for continuity.
Each call has 128 MiB memory, 512 KiB stack, 32 MiB JSON and a ten-second deadline.
No hook receives another decorator's generated result. Independent modifications
on different faces can overlap with undefined behavior; composition is not V1.

Geometry changes remap compatible descendant faces, transport the frame, then
repartition and validate. Ambiguous merges remain unresolved for explicit repair.
Mirror retains configured thread hand and scale retains physical pitch/clearance;
general transform hooks and print-in-place phase alignment are deferred.
Installation never executes code. After authoring, install the definition, explicitly
enable its exact source, inspect selected geometry, apply it, then validate through
export. Reopening requires code enablement again. A failed authoring script discards
its source/settings/membership changes and its pending code enablement together.
`;
