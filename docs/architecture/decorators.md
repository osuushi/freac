# Decorators V1

2026-09-24. Current implementation contract and founder-approved scope.
Metric is a diameter-driven family;
compatible split descendants inherit threads; decorator composition is outside V1;
off-table diameters remain exact/nonstandard; decorator code travels in the file.
Mirroring preserves configured handedness; scaling preserves pitch and clearance;
one fit allowance is implemented as hole-side relief. General transform hooks
are deferred.
Nearest-listed coarse pitch supplies the Metric default; compatibility and
consistency under equal settings take priority. End tapers are configurable and
middle-of-rod threads are in scope. Print-in-place support and user-facing phase
alignment controls are deferred. One decorator per face; effects
from different decorated faces may overlap with undefined behavior.

## Requested outcome

Attach editable settings to selected geometry without replacing that geometry.
At export, generate mesh modifications using the accepted geometry
as read-only input. Threads are the first built-in decorator. JavaScript authors
must be able to implement the same hooks. Gears, gear relationships, approximate
cylinder recognition, shader previews and print-color assignment are later work.

Apply to multiple cylindrical faces, internal or external. Reject incompatible
mixed selections with a reason rather than silently dropping targets. Partition
compatible faces into individual continuous thread instances; applying to several
rods creates several instances in one edit. Users normally see threads and their
settings, not the internal grouping noun.

## Ownership and geometry

DocumentOwner owns accepted attachments, settings and bundled source through
ordinary edits and snapshot Undo. Numeric candidates and generated preview meshes
are temporary. The native kernel supplies analytic face descriptors, tessellated
trimmed domains and immediate topology correspondence. Correspondence is consumed
during acceptance; it is not a persistent operation-history graph. Export refines
a read-only copy and performs mesh operations in a worker. There is no second
document, BRep mutation at export or executable feature history.

## Interaction

1. Select faces and invoke Threads; show eligibility reasons in tool discovery.
2. Create all inferred instances atomically with resolved settings and a preview.
3. A right-side decorator panel shows instances touching the selection, aggregated
   by type. Equal fields show values; unequal fields show Mixed. A change patches
   only that field across affected instances, preserving every other setting.
   Mixed selections show both built-in and custom controls. Editing or removing
   one type affects only that type's instances and selected members.
4. Editing a setting first selects all faces of the affected instances, then
   updates them in one Undo step. Numeric drafts preview; confirmation accepts;
   Escape cancels. Merely focusing a field should not change the document.
5. Clicking a decorator selects its faces. Deselecting some and using the panel's
   Remove threads action removes membership only from the still-selected faces.
   This must not be routed through the viewport's geometry Delete action.
6. Continue threads adds selected faces only when they form one compatible
   continuation with the chosen instance. Otherwise use decorator-specific wording
   and offer separate application; initial multi-rod application remains valid.
7. Removing members keeps the remaining phase and settings. Empty instances vanish.
   Do not automatically merge independently created instances after geometry edits.
8. A face has at most one decorator in V1. Applying Threads to an already threaded
   face opens its existing settings rather than adding another instance. A different
   decorator requires removing the existing assignment first.

The same typed operations serve agents, including inspection of settings, members,
resolved dimensions and diagnostics. Multi-selection does not create a permanent
relationship between separately threaded parts.

## Thread geometry contract

Equal reference diameters plus the same resolved thread definition must produce
complementary male/female profiles, with independently chosen lengths. Resolve
profile, pitch, hand, start count (one initially), reference convention and fit
allowance consistently; independent defaults per face must not break mating.

| Reference mode | Exterior rod | Interior hole |
| --- | --- | --- |
| Cut into rod | Remove material inward from the reference cylinder | Add complementary ridges inward into the hole |
| Cut into hole | Add ridges outward from the reference cylinder | Remove complementary grooves outward into the wall |

This describes the zero-clearance reference construction. Hole radial relief is
one outward radial offset applied to the entire female profile, including roots,
crests and flanks; it is not a normal-to-flank offset or an ISO fit class. The rod
receives no second allowance. The control displays millimeters.
Thread-form compatibility does not promise assembly through shoulders, flats,
unthreaded portions or blind-hole bottoms.

Confirmed: Metric is the preset family; cylinder diameter determines thread size,
rather than a preset such as M10 overriding the modeled cylinder. An off-table
diameter such as 10.3 mm remains exactly 10.3 mm and produces a nonstandard thread.
The chosen cut mode affects the relation between reference diameter and standard
major/minor diameters; that mapping must be explicit. Never silently relabel a
nonstandard result. Diameter changes update the reference diameter and its dependent
envelope dimensions using the same rule in preview and export, while resolved pitch
and clearance remain fixed. A preset supplies concrete settings; changing geometry
does not silently reapply that preset or choose a different pitch. Confirmed:
initialize Metric pitch from the nearest listed diameter's coarse pitch without
snapping the modeled diameter. Use one deterministic lookup and tie rule for both
internal and external threads. Applying equal settings to equal reference
diameters must resolve consistently, whether applied together or separately.

Printing presets are explicit heuristics based on chosen layer/nozzle dimensions
and intended orientation. Do not infer print direction from camera orientation or
claim guaranteed physical fit. Preset values, not just a mutable preset name, are saved.

The initial printing heuristic chooses the maximum of nearest coarse pitch,
six layer heights and three nozzle diameters upright, or ten layer heights and
five nozzle diameters sideways. It uses a rounded profile and radial hole relief
of half the nozzle diameter. Layer/nozzle defaults are 0.2/0.4 mm. Explicit edits
to these printing inputs re-resolve pitch/profile/relief; explicit values supplied
in the same edit win. Other edits and geometry transforms retain resolved values.
Printer controls appear only for printing presets; older saved settings without
these inputs normalize to the defaults.

## Thread extent and ends

Confirmed: default to full selected-face coverage without extending beyond its
boundaries. Start/end taper lengths are configurable, initially zero. Tapers reduce
thread depth near axial ends; they do not chamfer the underlying BRep. They do not
restart at face seams or angular interruptions such as flattened sides.

Middle-of-rod threads remain a V1 case; a thread need not reach the rod end.
This does not guarantee that mating parts can be assembled in every surrounding
geometry configuration.

The controls for an unsplit cylindrical face are start/end
insets along the saved thread axis, initially zero, bounding the threaded band
within the selected geometry. Intersect that band with actual selected face domains;
do not fill flats or gaps. Apply optional tapers at its axial ends and preserve
helix phase when changing extent. Exact behavior at separated axial patches must
remain consistent with one continuous helix and the requested face coverage.

Body splitting and partial decorator removal retain the previous axial reference
in the saved thread frame. Insets and tapers use that reference, while generated
coverage is clipped to surviving faces; a split outside the band can have empty
coverage without becoming unresolved. Continuing onto additional faces expands
the reference when necessary. Reassigning starts from the replacement geometry.
Rigid transforms transport the frame; scaling scales the inherited reference,
while pitch, relief, inset and taper settings retain their physical values.

Founder decision: defer print-in-place support, including user-facing phase
alignment controls and captive-pair acceptance. V1 promises compatible thread
forms, not clearance between independently decorated parts in their current
exported positions. Internal phase continuity within each thread instance remains
required across selected patches, topology changes and extent edits.

## Continuity, boundaries and editing geometry

Partition by body, cylindrical support (axis line and radius within documented
tolerances) and material side. Opposite parameter-axis signs do not imply different
supports. Disconnected selected patches can share one instance: angular gaps,
flats and separated axial sections do not restart the helix.

Save a thread reference frame and phase when first applied. Do not derive phase
again from the first remaining face or its parameter seam. Transport this frame
through rigid movement; copying creates independent instances with copied settings.

Use the actual trimmed face domains, including holes and sloping ends. A full
cylinder or min/max axial bounds is insufficient: it could fill flats, bridge gaps,
cut a neighboring wall, or extend threads beyond selected geometry. Construct
bounded, closed modifier volumes from the selected domain and chosen radial range.
Thread-specific diagnostics can inspect adjacent original geometry and report
implicated face IDs. This is distinct from cross-decorator overlap handling below;
V1 does not require detecting or diagnosing overlaps between decorator outputs.

The panel reports the exact reference diameter and its rod-major/rod-minor meaning
for the selected cut mode, identifying diameters absent from the coarse table as
nonstandard. Current nonblocking geometry warnings check opposite coaxial walls
with overlapping axial coverage against maximum removal depth, and adjacent flats
parallel to an internal thread axis against the circular mating envelope. These
are conservative local checks, not collision or assembly certification. Each
warning selects both decorated and implicated faces through ordinary selection.

The built-in constructs separate radial masks for selected trimmed patches and
unions them after clipping each against its adjacent planar boundaries. A plane
clips only when the selected patch lies on one side; a nonconvex patch crossing
that plane keeps its trimmed mask. Disconnected axial patches therefore cannot
clip each other or bridge their unselected gap. Export adds/removes the difference
from the nominal cylinder, bounded to the thread's radial envelope; it does not
replace a whole radial band that might contain an opposite wall. Small auxiliary
reference overlap covers base tessellation error without changing the requested
profile or hole allowance. Pure addition/removal cases emit their closed differential shell directly, avoiding
intermediate reference-volume Booleans. The internal Cut-into-rod case can require
both addition and removal after hole relief and retains the general difference
path. Both use the same analytic target and trimmed domains. Thread cuts can still pierce a wall when the requested
depth exceeds its thickness; that needs an explicit diagnostic, not a silent
change to thread dimensions.

Confirmed topology policy: follow compatible split
descendants, preserve phase and exclude newly generated unrelated faces. For
merges with unselected regions or conflicting settings, retain an unresolved
instance and identify the repair needed rather than expand coverage silently.
Consume immediate operation correspondence when accepting the geometry edit;
do not add a persistent operation-history graph. Undo restores geometry and
decorator assignments together. Body deletion removes its decorations.

Unresolved attachments remain in the document with their repair reason, even when
their original faces no longer exist. The panel can select surviving affected
geometry, reassign an attachment to selected compatible faces, or remove that
individual attachment. Unresolved attachments reserve no active face assignment.
They block export until repaired or removed, but do not hide valid previews on
other faces. Kept Boolean originals retain their own attachments; resulting bodies
receive independent identities through the same correspondence rules.

Confirmed V1 transform behavior: reflection preserves the configured handedness;
uniform scaling preserves physical pitch and clearance while the decoration follows
the changed cylinder diameter and face extent. The final decorated object therefore
need not be a literal reflection or scaled copy of its former exported mesh.
Transform the geometric placement/reference frame without implicitly reversing the
handedness setting or scaling those numeric settings. Do not retain a stale standard
size designation after the diameter changes.

General decorator hooks for transform-specific behavior are future work, not part
of the V1 interface. Nonuniform scale that destroys cylindrical eligibility must
visibly invalidate the affected threads. Geometry and decorator parameter edits
remain distinct operations.

## Small extension contract

Persist instance ID, definition ID/version, target references, validated settings,
and only the decorator-specific continuity data needed (thread frame/phase).
Preview meshes, kernel handles and geometric diagnostics are derived, never
authoritative. An unresolved attachment and its repair reason are persisted model
state so a later save/open cannot silently restore an ambiguous assignment.

Definition responsibilities:

- Settings schema: a bounded JSON-schema-shaped subset, units, labels, ranges,
  enums, defaults and conditional applicability; host owns Mixed-value behavior.
- Eligibility and partition: reasons, implicated targets and stable continuation
  information; Continue uses the same geometric rules plus its existing instance.
- Validation: structured errors/warnings with optional face/edge highlights.
- Optional preview: mesh overlay from the same geometric definition at coarser
  resolution; never selectable or hoverable. Depth bias handles coincident faces.
- Export: read-only original selected geometry context; generate independent
  mesh modifications for host application to the body mesh. No hook receives
  another decorator's output, and no identity-preserving BRep output is required.

Expose useful immutable geometry queries/descriptors, with exact BRep queries
prepared before mesh generation if necessary. Passing a BRep string alone does not
give JavaScript authors a usable geometric API. No BRep mutation in this pipeline.

Run geometry work outside the UI thread, with bounded inputs and cancellation.
Use a single sequential export pipeline from one accepted snapshot. Opening a
saved file must not automatically execute unknown embedded JavaScript. Confirmed:
bundle decorator code with the document. Packaging uses a self-contained
module and declarative manifest, stored once per definition/version, with no
network dependency resolution at export. Pin source bytes; updating code is an
explicit document change, not an installed plugin silently changing old exports.
Code replacement and settings edits are atomic owner edits with Undo. A script
can combine them in one accepted transaction; executable definitions are not
independently watched agent workspace files.
A Worker alone is not a security sandbox. Missing definitions
retain data, identify the missing dependency and block affected export rather
than silently omit a decoration. No marketplace or general plugin platform needed.

The interpreter is QuickJS through pinned `quickjs-emscripten-core` and
`@jitl/quickjs-wasmfile-release-sync` 0.32.0 (MIT; the WASM package includes the
QuickJS license). The wrapper creates a fresh VM for each synchronous hook,
installs no host callbacks, denies external imports, and exchanges only JSON.
Current bounds are 256 KiB source, 32 MiB input/output JSON, 128 MiB VM memory,
512 KiB stack and a 10-second hook deadline. Worker termination remains the
outer cancellation mechanism. Upstream runtime APIs are documented in the
[pinned runtime source](https://github.com/justjake/quickjs-emscripten/blob/df4efb9ef2cb25c417ecb57986da462d11b244ed/packages/quickjs-emscripten-core/src/runtime.ts).
These limits constrain execution; they do not validate returned geometry.

`decoratorDefinitions` stores a manifest, bounded settings schema and exact source
once per ID/version. The ordinary `decorator-definition` owner edit installs,
replaces or removes this bundle with snapshot Undo. Installation and opening do
not execute source. Replacement must preserve valid settings on existing instances;
removal is rejected while instances reference that version. Source-specific
enablement is owner-session state, cleared on new/open and excluded from archive
and Undo snapshots. Custom apply/settings/continue edits pass through the owner;
partition and diagnostic outputs are validated before acceptance. Export applies
validated closed modifier meshes to the original body mesh. Optional previews
can return open meshes and remain non-pickable. The library imports JSON bundles,
offers enable/disable/apply controls, and uses the manifest's settings fields.
The [raised-pad example](../../examples/decorators/README.md) exercises this path.
The read-only `decorator-inspect` query resolves eligibility/partition and
diagnostics through enabled code without changing the document or Undo. The
read-only `decorator-draft` query validates custom numeric settings through the
same enabled hooks. Built-in and custom numeric controls share a temporary
interaction: typing previews, Enter or blur accepts one edit, and Escape cancels.
Pending custom validation coalesces to the latest input; cancelled or obsolete
results cannot replace the current preview. Draft queries do not alter owner
candidates, accepted data or Undo.
The library disables Apply while checking, displays rejection reasons, and discards
results for replaced selections/documents. Selected custom instances show their
diagnostics with ordinary affected-face/edge selection. Highlight references must
exist on the selected bodies; invalid references reject the hook result. Highlighting
keeps the decorated faces selected so their settings remain available, and removes
duplicate targets. Custom topology continuation
uses the same immediate predecessor mapping as threads. Compatible descendants
are passed to partition/validation with the previous instance settings/state and
transported frame; returned groups receive independent IDs where necessary.
Merges with unrelated faces remain unresolved. Disabled code never runs during
continuation: the attachment remains repairable through enablement and reassign.
The work pending between native calculation and hook validation is ephemeral,
not serialized history. Manual and scripted geometry acceptance resolve it before
accepting a document. Continue offers the last selected custom instance on a new
face selection and enables only when inspection resolves one compatible group.
Acceptance expands selection to all members. Partial removal preserves remaining
members. The library exposes exact source, portable bundle export and Undoable
removal of unused bundles.

Agent scripts expose `decorators`, `inspectDecorator`, `editDecorator`,
`editDecoratorDefinition` and `enableDecorator`. Catalog and hook inspection read
the current temporary candidate. Edits share the ordinary instance/definition
validators, with script acceptance as one Undo step. Source enablement is forked
for the script and adopted only on success; cancellation/failure cannot change the
accepted session's permission. Enablement itself remains session state outside
Undo and archives. Ordinary inspection lists bundled source/schema, instances and
built-in fields; face inspection includes its attachments. Thread inspection uses
the same cylinder partition, settings resolution and highlighted local warnings.
`freac docs/types` carries the authoring and typed command contracts.

## Mesh export and preview

The export path captures accepted geometry/settings; prepares geometry context
and sufficiently accurate base tessellation; validates inputs; generates independent
modifications from the original geometry; applies those modifications to
each body mesh; validates results; and encodes through existing STL/3MF paths.
Bodies remain separate export objects. Failure identifies the body/decorator and
produces no partial file. Export changes neither the document nor Undo.

Confirmed: no decorator composition in V1. No ordering UI, modifier stack or
mesh-input decorator signature. Multiple independent decorations on a body are
still supported, with at most one decorator assigned to each face. Confirmed:
overlap between effects on different faces is undefined behavior in V1. Do not
implement cross-decorator conflict detection, special overlap warnings, or an
overlap-based export gate. Internal execution order is not a promised composition
contract. Apply the ordinary mesh validity/error checks to whatever result is
produced. The host's mesh Booleans are not a public composition API.

Manifold 3.5.3 is pinned as a build dependency. Vite bundles its core JS/WASM into
the export/preview workers; the npm package's CLI, glTF and image-conversion tools
are not imported or shipped. Release notices explicitly include its Apache-2.0
license despite the build-only npm classification. Native document/model modules
do not depend on the mesh runtime. No upstream implementation source was copied.

The initial built-in uses the metric basic 60° profile and nearest coarse pitch
from the [manufacturer reference table](https://sg.misumi-ec.com/tech-info/categories/technical_data/td01/a0063.html).
User-selected clearance is a radial hole-side allowance, not an ISO fit class.

Separate numerical Boolean precision, mesh approximation error and intentional
print clearance. A finer thread mesh cannot recover a coarse base cylinder. Define
an export error budget in millimeters relative to thread depth/fit, and retessellate
the export copy when needed. Avoid silently increasing weld tolerance to fix errors.

The built-in export prepares an accepted read-only snapshot through the geometry
query worker. Only decorated bodies are retessellated; the original BRep, IDs,
settings and Undo history stay unchanged. The linear sampling target is the minimum
of 0.004 mm, pitch/200 and positive hole relief/8; zero relief does not imply zero
numerical tolerance. Requests below 0.00001 mm fail explicitly. Metric mesh edges
follow crest/root transitions; axial rows include taper transitions. Untapered
metric threads bound the mixed radial/angular interpolation error to choose axial
samples; rounded profiles and tapered metric threads retain their curvature-based
sampling. The sampling target and fit allowance are unchanged. Facet samples
are checked against the analytic envelope with a separate allowance of twice the
sampling target. This is measured numerical accuracy, not a general certification
of arbitrary curved neighboring surfaces or physical fit.

Trimmed thread domains also respect directly adjacent analytic cylindrical
boundaries when the entire selected patch lies on their material side. Hole
boundaries use a circumscribed polygon and exterior limits an inscribed polygon,
with radial deviation below half the sampling target. Coincident supporting
cylinders do not constrain each other's threads. This preserves transverse bores
in both external and internal threaded faces. Nonconvex patches straddling an
adjacent boundary retain their tessellated domain mask; this is not a general
extension/intersection treatment for arbitrary BRep surface classes.

Mesh Booleans run in body-local coordinates so world placement does not consume
float precision. Their recorded numerical rounding must fit within one quarter
of the sampling target. Float packing can collapse very small Boolean facets;
short edges of actually collapsed facets are normalized within the existing
rounding bound. An exactly collinear facet with distinct vertices is re-triangulated
against its adjacent face at the existing middle vertex, without moving vertices
or changing the represented surface. Duplicate packed vertices are resolved first.
The result must still pass closure/orientation/nondegeneracy checks. STL conversion gets a separate bounded packing check. If world coordinates
exceed that format's float precision, STL rejects with a 3MF alternative; 3MF keeps
the restored world positions. No larger general-purpose weld tolerance is used.

Export preparation and mesh generation show status. Cancel export discards a
pending preparation result or terminates the mesh worker and publishes no file.
It does not undo accepted edits or replace the document with the export snapshot.

A preview compositor reveals recessed surfaces through their own attached faces.
Each visible decorator gets an occlusion-depth pass with only its source faces
hidden; caps, unrelated faces and other bodies remain occluders. Its opaque preview
is tested against that depth and rendered into a shared color/depth target. All
previews compete for nearest depth before one alpha blend over the ordinary scene,
so overlap does not accumulate transparency or depend on decorator order.
Two reusable full-viewport targets bound buffer memory; draw work grows with visible
decorators. The passes preserve clipping, visibility and renderer state. Preview
meshes remain non-pickable, and neither accepted geometry nor Undo changes.
The original surface color remains under the translucent result: this is an
illustrative preview, not an export-result replacement. Mechanical interference warnings can be
nonblocking; invalid output remains an export error. General assembly/motion proof
is outside V1; warnings must describe what was actually checked.

## Acceptance scope

1. One external and one internal full cylinder,
   shared procedural definition, both reference modes, panel editing/removal,
   preview, save/open, Undo/Redo and validated STL/3MF. Benchmark final generation.
2. Multi-selection, continuation/removal, interrupted/sloping domains, phase
   preservation and topology edits. This completes the requested geometry scope.
3. Verified metric/printing presets, clearance, axial extent and end/runout controls,
   and thread-specific highlighted diagnostics;
   finish print-oriented acceptance. No cross-decorator conflict detection.
4. JavaScript module loading/portability, agent parity and a small independent
   example decorator proving the contract without special-casing Threads.

Acceptance uses real geometry and ordinary pointer/keyboard routes.
Measure preview and export on short/long threads and batches; do not promise
near-instant generation before measuring cold and warm worker runs.

The reproducible worker benchmark is `node tests/decorator-performance.mjs` after
`npm run build` and `npx tsc -p tsconfig.test.json`. It creates real native cylinders,
prepares read-only export tessellations, and measures first/repeated preview and
3MF generation in fresh headless Chromium/WebKit contexts. The 2026-09-24 macOS
arm64 measurements for Ø10 mm, 1.5 mm metric pitch were about 0.57–0.62 s for a
10 mm thread, 3.8–4.5 s for an 80 mm thread, and 5.4–6.1 s for six 20 mm threads.
These are approximately 2.5–3× faster than the initial export implementation.
Repeated previews were about 0.1 s, 0.53–0.54 s and 0.66–0.74 s respectively;
native export preparation was 33–61 ms. These are local measurements, not
cross-device guarantees. Large exports still take seconds; status/cancellation
keep that work explicit. The cache JSON retains each measured first/repeat run.

Acceptance includes mating cross-sections and screw-motion checks over specified
travel; both hands and modes; different lengths; multi-rod selection; reversed
axis parameterization; split seams and flattened/gapped cylinders; close neighbors;
thin walls and blind ends; field-level mixed edits; partial removal; move/copy/
mirror/scale policy; save/reopen; missing plugin; cancel/failure/Undo; exported
closure/orientation and geometric deviation; middle-of-rod threads with configured
extent, tapers and clearance. Print-in-place alignment is outside acceptance. Verify
single assignment per face; do not require a particular geometric result from
overlapping independent decorators. Physical printer fit requires a real
print, which software checks cannot certify. Run headless Chromium/WebKit and
hidden Electron where host/plugin boundaries change.
