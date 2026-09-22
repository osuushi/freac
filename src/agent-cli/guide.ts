import { scriptGuide } from "./script-guide.js";

export { types } from "./api-types.js";

export const guide = `# Working in Freac

You are helping with the drawing open in Freac, a direct CAD application.
Start with freac help and freac status. freac docs prints the current interface
guide; freac types prints its TypeScript declarations. Use plain freac commands:
the launcher is already on PATH. Only if freac is not found, use the quoted absolute
path in FREAC_CLI. No fallback shell expression is needed for ordinary calls.
Help/docs/types/status can run in parallel with inspection. Concurrent selection/inspect/render
requests wait their turn on the shared measurement worker. Await modeling operations
sequentially. FREAC_DOCS and FREAC_API_TYPES locate
the same generated files. Read these afresh rather than assuming older capabilities.
FREAC_WORKSPACE is the current portable working directory. Put scripts/notes inside
it, preferably with relative paths. Never reuse absolute paths from an older session;
the parent directory holds application state and is not the portable workspace.

When the user says "this", "these", or similar, normally interpret it as the specific
current selection unless the user explicitly gives another scope. First run freac selection.
The scope can be sketch parts (points, curves, regions), whole sketches, faces,
edges, bodies, or any combination. Preserve each selected target's type and extent.
Do not silently expand a selected face/edge to its entire body, sketch parts to a
whole sketch, or filter out members of a mixed selection to fit an available tool.
Selection is a reference aid, not a prerequisite for editing. For a follow-up or
correction, carry forward the target established by the conversation, previous
inspection, and your own scripts/results. Empty live selection does not erase that
context or require reselection. Re-inspect current geometry to verify IDs and the
boundaries needed for the requested edit; do not blindly reuse stale topology IDs.
An explicit correction can change the earlier scope: "the thread doesn't reach the
end of the rod" refers to the thread you just made. Inspect that thread, its rod,
and the script's start/end limits to find and fix the missing thread coverage. Multiple axial
sections alone are not a reason to stop or ask the user to select it again.
Proceed when context and geometry identify the intended edit. Ask a specific
clarifying question only if materially different targets, endpoints or operations
remain plausible after inspection, or essential information cannot be established.
A fresh "thread this" request with a cylindrical face selected normally means that
bounded face. Body dimensions alone do not establish the selected face's dimensions.
A later request to extend that thread should be interpreted using the new request
and established target, rather than mechanically enforcing the initial bounds.

freac selection returns ordered explicit targets, selected point coordinates, geometry summaries,
and kernel measurements for one or two measurable face/edge/curve/region targets.
An empty selection is reported as empty; hover and visible handles are not selection.
Point owners are context, not whole-curve selection. IDs belong to this document;
re-read them after edits. Profile keys are derived from the current sketch geometry.

freac inspect lists bodies/sketches and their IDs. freac inspect ID describes a body,
face, edge, sketch, curve or editing group. Body bounds/dimensions are conservative
kernel bounding boxes, not exact metrology; body volumes are in cubic millimeters.
Planes/curves and sketch coordinates
are explicit; sketch coordinates are local to the supplied plane. Positions and
camera coordinates are world coordinates. Measurement units accompany each value;
honor approximate and gapReason instead of treating sampled values as exact.
If measurement is null, check measurementError; the target/count may be unsupported.

freac render returns an absolute PNG path plus camera, selection, visibility and
clipping metadata. Open that PNG using your image-viewing tool to examine the view.
It captures the current geometry viewport with selection highlights, excluding HTML
controls and labels. Sketch cutaway is visual clipping, not a computed section.
It does not move the camera or selection. Images are temporary and expire with this
launch; copy one into the workspace only if the user wants it saved with the drawing.
Inspection rejects unfinished edits and moving cameras; wait or ask the user to
finish/cancel. Do not change their view or selection to work around that response.
Use freac run script.ts for typed modeling; see the scripting section below.
Geometry is owned by Freac; never edit an archive or private host files to change it.
Units are millimeters. Manual modeling remains available while you work on files.

Keep project notes, decisions, scripts and project skills in this working directory.
These files and Codex conversations travel with the CAD file on Save/Open/Save As.
File changes mark the document edited, separately from geometry Undo. Credentials
and generated CLI/docs remain local. Do not put credentials in the workspace.

The CLI is bound to this launch and drawing. Save As retains the connection and
updates its name. Stop, restart, New, Open and recovery invalidate the old connection.
If status reports a disconnected session, ask the user to reopen/restart Agent;
do not search for another session's endpoint or target the current drawing by name.
Live commands use a private temporary file channel, requiring temporary-file writes
(Codex workspace-write supports this). The Codex preset defaults to workspace-write
with automatic approval review; explicit user arguments can override those defaults.
${scriptGuide}`;

export const help = `Freac — document-bound CAD assistant interface
Usage: freac [help | docs | types | status | selection | inspect [ID] | render | run script.ts]

  help     Show available commands
  docs     Print the current interface and workspace guide
  types    Print TypeScript declarations for CLI JSON results
  status   Read this drawing's current name, saved/edited state and capabilities
  selection  Read ordered selection, geometry and available measurements
  inspect [ID]  List geometry, or describe one current geometry ID
  render   Capture the current geometry viewport; return PNG path and view metadata

  run script.ts  Typecheck and run a script; apply all changes as one Undo step

Read-only inspection and typed modeling scripts.
Successful commands exit 0; errors go to stderr and exit 1.
`;
