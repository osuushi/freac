# Mesh surface fitting

`makeshift.fitMesh(input)` reconstructs one ordinary editable solid from a triangle
mesh and an explicitly supplied quad layout. It runs inside `makeshift run` and
uses the existing serialized script candidate. DocumentOwner accepts the complete
script once; cancellation or a failed CLI run leaves accepted geometry unchanged.
The mesh, layout, fit controls and correspondence samples are temporary calculation
data, not another application document or a persistent feature history.

## Input and result

- `mesh`: world-space `vertices` in mm and indexed `triangles`.
- `layout`: world-space `vertices`, indexed `quads`, and optional `creases` given
  as pairs of layout vertex indexes. All other patch joins are treated as smooth.
- `tolerance`: maximum accepted **sampled** distance in either direction, in mm.
- `smoothAngle`: maximum sampled angle between normals across smooth seams,
  in degrees (default 5, supported range 0.1–30).
- `maxPatches`: patch budget, default and maximum 256. The initial layout must fit
  within this budget; each uniform refinement multiplies the count by four.

Both inputs must be one connected, consistently outward-oriented, closed manifold
of the same genus. The layout must already follow the target's shape and features.
Index and manifold checks reject open surfaces, unused vertices, disconnected
components, repeated vertices, degenerate faces and inconsistent winding.
There is no automatic retopology, mesh repair, nesting of separate shells, or mesh
file importer in this operation. Input limits are 100000 vertices per mesh/layout,
200000 target triangles and 256 initial quads. Target diagonal must be between
0.0001 and 1000000 mm; tolerance is at least 0.000001 mm and at most 10% of that
diagonal. Coordinates have magnitude at most 1000000000 mm.

The result includes the ordinary full candidate body inventory and a `fit` object:
patch/control-point counts, `sampledSurfaceToMesh`, `sampledMeshToSurface`,
`sampledRms`, `sampledSeamAngle`, and distance sample count. Measurements are not
stored as accepted model identities or a certificate attached to the solid.

## Construction and checks

The native calculator normalizes temporary coordinates, builds a triangle nearest
point index, and fits a shared bicubic Bézier control network. Boundary controls
are shared exactly between neighbors. A joint sparse least-squares solve combines
forward/reverse distance samples, normal alignment, tangent-frame regularization,
and mild fairness. Tangent regularization applies to each iteration rather than
anchoring the final shape to the initial layout. Bounded steps protect the sampled
patch orientation.
Declared crease edges omit the smoothness constraint. Shared de Casteljau
subdivision preserves the existing surface before another fit iteration.
Crease initialization uses the intersection of the incident target tangent planes;
this allows curved sharp boundaries such as cylinder rims.
Without declared creases, target vertex normals average all incident triangles,
including steep angles on thin rounded rims. With declared creases, target normal
estimation separates incident triangles more than 45 degrees apart; the final
sampled seam and distance checks still determine acceptance.

Validation uses denser surface stations than the fit, every target vertex, and
each target triangle's centroid and edge midpoints. Smooth-seam angles are checked
at 33 stations per edge. Target-to-surface checks refine a tessellation-seeded
closest point on the actual bicubic surface. Singular/folded candidates and unmet
budgets reject. These checks are numerical samples: they do not certify global
Hausdorff distance or exact G1 continuity. Geometric self-intersection of the input
triangle mesh is not independently certified by its combinatorial manifold check.

OCCT builds the final faces and sews at 0.0000001 mm, independently of the fitting
allowance. Planar fitted supports are retained as planes. The result must pass
strict B-rep validity, positive volume, outward orientation, closed-shell,
topology-count, per-entity tolerance and self-interference checks. Larger fitting
allowances never enlarge the kernel sewing tolerance.

The accepted result uses ordinary body/face/edge IDs, selection, transforms,
Boolean operations, Undo and archive paths. A valid reconstructed solid does not
guarantee that every later fillet, shell or offset is feasible.

## Review route

The [self-contained example](../examples/mesh-fitting.ts) reconstructs a sphere from
a dense triangle mesh and six coarse quads. Copy it into the open document's agent
workspace and run `makeshift run mesh-fitting.ts`. Inspect the printed measurements,
select the fitted faces/body, move it, Undo/Redo, then save and reopen.

After the normal repository setup and Node activation, `npm test` includes the
shape, invalid-input, document-ownership and cancellation matrix. `npm run build`
followed by `node tests/mesh-fit-ui.mjs` exercises the typed CLI route in headless
Chromium/WebKit and hidden Electron. For the focused numerical and export checks,
enable `MAKESHIFT_KERNEL_TESTS=ON` in the configured `.build/kernel` CMake build,
build `mesh-fit-math-test` and `step-readback`, then run
`.build/kernel/mesh-fit-math-test` and `node tests/mesh-fit-export.mjs`.
The export check uses the compiled test modules produced by `npm test`.

The first implementation uses uniform patch refinement to preserve a conforming
edge network. Local refinement, automatic layout generation, arbitrary open sheet
insertion, exact tangent continuity at all parameters, and general analytic
primitive recognition are outside this operation's current contract.

Strongly bent layouts can still collapse corner parameter directions even with
96 initial patches. The regression fixture with radii 6/6/20 mm and a 12 mm
quadratic bend is rejected; a 4 mm bend fits. More patches alone are not a general
remedy: layout placement and parameter conditioning matter. Thin shapes need an
allowance chosen relative to their thickness if volume accuracy matters; the
15/10/1.5 mm ellipsoid acceptance uses a 0.05 mm allowance and 96 initial quads.
