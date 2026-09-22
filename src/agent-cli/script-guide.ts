export const scriptGuide = `
## Typed modeling scripts

Write a single .ts file in this workspace and run freac run script.ts. The installed
TypeScript compiler checks a source snapshot before execution; no separate Node or
TypeScript install is needed. The global freac object has the API printed by freac types.
Available modeling calls are createSketch, extrude, revolve, offsetFaces, transformBodies,
constructionPlane, deleteConstructionPlane, splitBody, imprint, scale, sweep, booleanBodies, finishEdges and shell.
Revolve already includes constant-pitch helical sweeps; it is not limited to rings.
constructionPlane({frame}) returns {plane,frame}; pass id to reposition an existing plane.
Sketches copy frames and remain independent when a plane moves or is deleted.
Inspect lists saved constructionPlanes and inspect ID returns their frames.
splitBody({targets:[{body}],frame}) cuts entire bodies; imprint requires explicit
faces in each target and preserves material. Frames describe infinite cutting planes.
scale accepts curves, sketches, or solids (whole bodies, faces or edges), a positive
factor and a world-space pivot. ScaleResult returns current sketch/profile IDs and
body topology for chaining; re-read these after changing geometry.
extrude accepts symmetric:true; distance is total cap-to-cap depth.
sweep takes sources, mode/targets and 1–256 world-space line or cubic Bézier segments.
Each segment has a and b; Béziers also have c1 and c2. Ordered endpoints must coincide
and adjoining tangents must agree. Smooth closed paths are supported. Put the start
point in the section plane, with its tangent perpendicular to that plane. The section
starts in its existing position and follows OCCT corrected-Frenet orientation to
reduce twist. No fixed-world frame, custom roll law or automatic sharp-corner treatment
is provided yet. Invalid/self-intersecting swept solids reject the whole script.
The path is temporary input, not a selectable or saved document object. Mathematical
functions can generate Bézier control points in ordinary TypeScript before the call.
booleanBodies takes ordered distinct body IDs, union/subtract/intersect and keepOriginals.
Subtract uses the first body as base and later bodies as cutters. With keepOriginals,
subtract retains the cutters; union/intersect retain all input bodies alongside results.
finishEdges takes explicit body/edge IDs, fillet/chamfer and size in mm. Tangent contours
follow the manual tool's behavior. Zero does nothing; negative or unachievable sizes
reject the whole script, even when a manual preview could show a smaller feasible size.
shell takes body IDs and explicit opening face arrays. Empty faces means a closed hollow;
negative thickness hollows inward and positive outward. Thickness is never clamped.
The existing analytic-surface limits apply; unsupported shapes reject normally.
Use returned topology IDs after each edit; consumed edges and openings may disappear.
Top-level await works. Relative imports and additional source files are not supported
in this first increment. Use console.error for diagnostic text; stdout is CLI JSON.

Await every modeling call. Selection is captured once at script start and is available
as freac.selection. Preserve the intended selection scope, including mixed targets;
do not silently filter unsupported targets or expand them to their owners. If that
scope seems incompatible, inspect the established target and conversation first;
clarify only unresolved ambiguity. An empty freac.selection does not prevent a
follow-up edit using verified explicit IDs from the established task.
Whole-sketch selection geometry and freac inspect (overview or sketch ID) include
profiles containing {sketch, profile} source fields plus area (mm²) and outer/hole
boundary spans referencing existing curve IDs. Span parameters are radians for
circles/arcs and 0–1 for segments/Béziers; descending spans reverse traversal.
Use those current keys
for existing sketches; never construct profile IDs from a sketch ID or index. An
open sketch has no closed profiles. After edits, inspect again or use refreshed
operation results; choose the intended region when several profiles are listed.
Use explicit IDs, including returned profile/body/face IDs in later
calls. A result describes the temporary candidate, not yet accepted geometry. Every
operation uses the same solver/kernel as manual tools. Failed calls abort the entire
script even if user code catches the exception. Scripts have a 15-minute limit and
at most 100 modeling calls; each native calculation has a five-minute watchdog.
Calls reject busy manual edits; never cancel the user's
preview just to make a script run. Other geometry edits are blocked during execution;
navigation stays usable. Cancel script or Escape outside the terminal discards all
candidate changes. Ctrl-C in the terminal interrupts the runner. Stop/disconnection
also discards the candidate. A runner which disappears is detected within five seconds.

Successful completion automatically accepts all changes as one Undo step. A no-op
creates no navigable Undo step. Failed/cancelled scripts preserve existing Undo/Redo.
Separate scripts are separate steps, even in one conversation turn. Turn-level grouping
is deferred until harness-specific hooks exist. Filesystem/network side effects are
outside geometry Undo. Script code runs in a CLI child process, inheriting its sandbox;
Freac does not execute arbitrary script code in its host or renderer.

Example: create an editable circle sketch and a separate extruded solid:
\`\`\`typescript
const sketch = await freac.createSketch({
  plane: "XY", curves: [{ kind: "circle", center: { x: 0, y: 0 }, radius: 10 }],
});
const solid = await freac.extrude({ sources: sketch.profiles, distance: 8, mode: "new" });
console.error(solid.bodies.map(body => ({ id: body.id, volume: body.volume })));
\`\`\`

Example: a nonplanar tube using a mathematical cubic path, with no path object:
\`\`\`typescript
const section = await freac.createSketch({
  plane: "XY", curves: [{ kind: "circle", center: { x: 0, y: 0 }, radius: 1 }],
});
await freac.sweep({
  sources: section.profiles, mode: "new",
  path: [{ kind: "bezier", a: [0, 0, 0], c1: [0, 0, 10], c2: [10, 0, 20], b: [10, 10, 30] }],
});
\`\`\`

Example: offset selected faces by 2 mm, rejecting point/edge/empty selection:
\`\`\`typescript
const faces = freac.selection.filter(target => target.kind === "face");
if (!faces.length || faces.length !== freac.selection.length) throw new Error("Select faces first");
await freac.offsetFaces({ faces, distance: 2 });
\`\`\`

Example: a continuous right-handed triangular helix about the positive Z axis:
\`\`\`typescript
const points = [{ x: 5, y: 0 }, { x: 6, y: -0.5 }, { x: 6, y: 0.5 }];
const section = await freac.createSketch({
  plane: "XZ",
  curves: points.map((a, i) => ({ kind: "segment", a, b: points[(i + 1) % points.length] })),
});
await freac.revolve({
  sources: section.profiles, axis: { origin: [0, 0, 0], direction: [0, 0, 1] },
  angle: 720, height: 4, mode: "new",
});
\`\`\`
Height is TOTAL signed axial travel, not pitch: 720 degrees and 4 mm means two
turns at 2 mm pitch. Angle follows the right-hand rule about the oriented axis;
matching angle/height signs produce a right-handed helix, opposite signs a left-handed
helix. The axis must lie in the section plane. A triangular section overlapping a
shaft can use mode "subtract" and explicit target body IDs to cut a continuous
helical groove, or "union" to add a ridge. Choose the section, pitch, extent and
handedness from the user's request; this is not an automatic standard-thread tool.
Do not substitute disconnected rings for a helix or claim a manual tool can be
enabled without evidence. A missing script method is an interface limitation,
not proof that Freac lacks the corresponding manual CAD operation.

createSketch supports ordinary segments, circles, arcs and cubic Beziers. It creates
an independent sketch with no inferred constraints. Sketches and solids can then be
selected and edited manually. There is no feature-history link from a solid back to
its source sketch. Offset requests that cannot achieve the requested distance reject;
the script does not silently accept a clamped offset. Run freac inspect/render after
completion to check the accepted result.
`;
