import { installAgentDock } from "../agent/dock.js";
import { installInspection } from "../agent/inspection-view.js";
import { installScriptView } from "../agent-script/view.js";
import { installTabletChrome } from "../ipad/connection-screen.js";
import { installIPadButton } from "../ipad/desktop.js";
import { BodyActions } from "../model/body-actions.js";
import { BodyEdgeFinishControls } from "../model/body-edge-finish-controls.js";
import { BodyMoveControls } from "../model/body-move-controls.js";
import { BooleanControls } from "../model/boolean-controls.js";
import { CleanupControls } from "../model/cleanup-controls.js";
import { ConstructionPlaneControls } from "../model/construction-plane-controls.js";
import { DeleteTopologyAction } from "../model/delete-topology-action.js";
import { EntityViewer } from "../model/entity-viewer.js";
import { FaceOffsetControls } from "../model/face-offset-controls.js";
import { MeasurementControls } from "../model/measurement-controls.js";
import { MirrorControls } from "../model/mirror-controls.js";
import { ModelingTools } from "../model/modeling-tools.js";
import { OverlapInput } from "../model/overlap-input.js";
import { PlaneCutControls } from "../model/plane-cut-controls.js";
import { ProjectionControls } from "../model/projection-controls.js";
import { ScaleControls } from "../model/scale-controls.js";
import { SectionControls } from "../model/section-controls.js";
import { ShellControls } from "../model/shell-controls.js";
import { TopologyMoveControls } from "../model/topology-move-controls.js";
import { ToolMenu } from "../tools/menu.js";
import { installPlaneBounds } from "./plane-bounds.js";
import { planeEntryTools } from "./plane-entry-tools.js";
import { inspectPlaneTargets } from "./plane-target-inspection.js";
import "../model/entity-viewer.css";
import { BodyEdgeControls } from "../model/body-edge-controls.js";
import { bodyView } from "../model/body-view.js";
import { visibilityControls } from "../model/visibility-controls.js";
import "./style.css";
import "./modeling.css";
import { pickSavedPlane } from "../model/saved-plane-picking.js";
import { ModelControls } from "./model-controls.js";
import { modelHighlight } from "./model-highlight.js";
import { pickModels } from "./model-selection.js";
import "./edit-overlay.css";
import "./constraints.css";
import "./fillet.css";
import "./trim.css";
import "./offset.css";
import { BezierControls } from "./bezier-controls.js";
import { BowControls } from "./bow-controls.js";
import { calculationControls } from "./calculation-controls.js";
import { ConstraintDisplay } from "./constraint-display.js";
import { installControls } from "./controls.js";
import { CurvedConstraints } from "./curved-constraints.js";
import { Dimensions } from "./dimensions.js";
import { drawSketches } from "./drawing.js";
import { SketchEditor } from "./editor.js";
import { FilletControls } from "./fillet-controls.js";
import { PointerGestures } from "./gestures.js";
import { LineConstraints } from "./line-constraints.js";
import { OffsetControls } from "./offset-controls.js";
import { PointChooser } from "./point-chooser.js";
import { PointEdgeControls } from "./point-edge-controls.js";
import { PointTangentControls } from "./point-tangent-controls.js";
import { drawRegionFills } from "./region-fill.js";
import { selectionFrame } from "./selection-frame.js";
import { SelectionOverlay } from "./selection-overlay.js";
import { TransformOverlay } from "./transform-overlay.js";
import { TrimControls } from "./trim-controls.js";
import { World } from "./world.js";
import { worldLabels } from "./world-labels.js";

const app = document.querySelector<HTMLElement>("#app");
if (!app) throw new Error("Missing app root");
app.innerHTML = `<div id="world"></div><div id="overlay"></div>
  <header><strong>freac</strong><span class="mode-label">Modeling</span></header>
  <div class="status" role="status"></div><div class="navigation-hint">Two-finger scroll · pan &nbsp; ⌘-drag · orbit &nbsp; Pinch · zoom &nbsp; Hold · choose overlap</div>`;
const host = app.querySelector<HTMLElement>("#world"),
  overlay = app.querySelector<HTMLElement>("#overlay"),
  status = app.querySelector<HTMLElement>(".status");
if (!host || !overlay || !status) throw new Error("Missing viewport elements");
const world = new World(host, overlay),
  editor = new SketchEditor(world);
installPlaneBounds(editor);
const readouts = document.createElement("div");
readouts.className = "selection-readouts";
app.append(readouts);
const disposeCalculation = calculationControls(editor, app);
const disposeLabels = worldLabels(
    world,
    overlay,
    (point, depth) =>
      (!world.planePicker && pickModels(editor, point).length > 0) ||
      !!pickSavedPlane(editor, point, depth),
    () => {
      editor.modeling.hover = null;
      editor.refresh();
    },
  ),
  disposeDrawing = drawSketches(editor),
  disposeFills = drawRegionFills(editor);
const modelControls = new ModelControls(editor, overlay);
const shells = new ShellControls(editor, overlay);
const faceOffsets = new FaceOffsetControls(editor, overlay);
const faceMoves = new TopologyMoveControls(editor, overlay);
const edgeMoves = new TopologyMoveControls(editor, overlay, "edges");
const bodyFinishes = new BodyEdgeFinishControls(editor, overlay);
const booleans = new BooleanControls(editor, overlay);
const bodyMove = new BodyMoveControls(editor, overlay);
const cleanup = new CleanupControls(editor, overlay);
const disposeModelHighlight = modelHighlight(editor);
const disposeBodies = bodyView(editor);
const selection = new SelectionOverlay(editor, overlay);
const transforms = new TransformOverlay(editor, overlay);
const constraints = new ConstraintDisplay(editor, readouts);
const pointEdge = new PointEdgeControls(editor, constraints.available);
const pointTangent = new PointTangentControls(editor, constraints.available);
const pointChooser = new PointChooser(editor, overlay);
const lineConstraints = new LineConstraints(editor, constraints.available);
const curvedConstraints = new CurvedConstraints(editor, constraints.available);
const beziers = new BezierControls(editor, overlay);
const bows = new BowControls(editor, overlay);
const fillets = new FilletControls(editor, overlay);
const trim = new TrimControls(editor, overlay);
const offsets = new OffsetControls(editor, overlay);
const dimensions = new Dimensions(editor, overlay),
  gestures = new PointerGestures(editor),
  disposeControls = installControls(editor, dimensions, app);
const modelingTools = new ModelingTools(
  editor,
  () => modelControls.activateRevolve(),
  (mode) => bodyFinishes.setMode(mode),
);
const bodyActions = new BodyActions(
  editor,
  (copy) => bodyMove.enable(copy),
  booleans.start,
  cleanup.start,
);
const deleteAction = new DeleteTopologyAction(editor);
const mirror = new MirrorControls(editor, overlay);
const scaling = new ScaleControls(editor, overlay, () => {
  if (editor.world.active) return editor.activateMove();
  else if (
    editor.modeling.targets.every((target) => target.kind === "sketch" || target.kind === "profile")
  )
    modelControls.move();
  else {
    editor.modeling.setTool("move");
    editor.refresh();
  }
});
const projection = new ProjectionControls(editor, overlay);
const sections = new SectionControls(editor);
const bodyEdges = new BodyEdgeControls(editor);
const disposeVisibility = visibilityControls(editor);
const entities = new EntityViewer(editor, app);
const constructionPlanes = new ConstructionPlaneControls(editor, overlay, entities.referenceRows);
const measurements = new MeasurementControls(editor, app, readouts);
const overlaps = new OverlapInput(editor, (plane) => constructionPlanes.select(plane));
const planeCuts = new PlaneCutControls(editor, overlay, constructionPlanes.picker);
const disposeAgent = installAgentDock(app);
const disposeInspection = installInspection(editor);
installIPadButton(editor, app);
installTabletChrome(app);
const disposeScript = installScriptView(editor, app);
const disposePlaneEntry = planeEntryTools(editor);
const toolMenu = new ToolMenu(editor, app);
world.changed.add(() => {
  const mode = app.querySelector(".mode-label");
  if (mode) mode.textContent = world.active ? "Sketching" : "Modeling";
  status.textContent =
    (editor.store.slow ? (world.active ? "Solving sketch…" : "Calculating geometry…") : "") ||
    editor.message ||
    editor.notice ||
    (world.active
      ? `${world.active} sketch · ${world.spacing} mm grid · ${editor.tool === "trim" ? "Trim · click a highlighted span" : (editor.snap?.label ?? (editor.moveMode ? "Transform · Shift uniform · Option about anchor · ⌘-drag box moves" : "Shift bypasses geometry snaps · Option / Alt draws/resizes about center"))}`
      : editor.modeling.targets.length
        ? `${editor.modeling.targets.length} ${editor.modeling.targets.every((t) => t.kind === "body") ? "body" : editor.modeling.targets.every((t) => t.kind === "edge") ? "edge" : editor.modeling.targets.every((t) => t.kind === "face") ? "face" : editor.modeling.targets.every((t) => t.kind === "sketch") ? "sketch" : editor.modeling.targets.every((t) => t.kind === "profile") ? "region" : "item"} selected${editor.modeling.targets.every((t) => t.kind === "body" || t.kind === "sketch") ? " · M to transform" : ""}`
        : editor.tool === "rectangle"
          ? "Rectangle · Choose a plane to sketch"
          : editor.tool === "trim"
            ? "Trim · Choose a plane to sketch"
            : "Choose a plane to sketch");
});
// Read-only inspection of accepted geometry and its projection; no hidden edit path.
Object.defineProperty(window, "freacInspect", {
  value: () => {
    const frame = selectionFrame(editor),
      sketch = editor.sketch;
    return structuredClone({
      document: editor.store.data,
      busy: editor.blocked,
      solving: editor.store.working,
      solver: editor.store.statistics,
      preview: editor.candidate,
      interaction: editor.interactions.current
        ? { kind: editor.interactions.current.kind, phase: editor.interactions.current.phase }
        : null,
      activePlane: world.active,
      planeTargets: inspectPlaneTargets(world),
      activeSketch: editor.sketch?.id ?? null,
      modelingSelection: editor.modeling.targets.map((t) =>
        t.kind !== "profile"
          ? t
          : {
              kind: t.kind,
              sketch: t.sketch,
              key: t.profile.key,
              area: t.profile.area,
              holes: t.profile.holes.length,
            },
      ),
      modelingTool: editor.modeling.tool,
      modelingHover: editor.modeling.hover?.kind ?? null,
      camera: {
        position: world.camera.position.toArray(),
        up: world.camera.up.toArray(),
        target: world.target.toArray(),
        height: world.height,
        moving: world.cameraMoving,
        orbitActive: world.orbit.active,
      },
      selection: [...editor.selectionOwners],
      selectionTargets: editor.selected.targets,
      moveMode: editor.moveMode,
      tool: editor.tool,
      selectedCurves: [...editor.selectedCurves],
      selectedPoint: editor.selectedPoint,
      pointChoice: editor.pointChoice ? [...editor.pointChoice] : null,
      hover: editor.hover,
      snap: editor.snap,
      gridSnap: editor.gridSnap,
      pivot: editor.pivot,
      rotationHandle: sketch && frame ? world.projectLocal(sketch.plane, frame.handle) : null,
      projection: world.activeFrame
        ? {
            origin: world.projectLocal(world.activeFrame, { x: 0, y: 0 }),
            u: world.projectLocal(world.activeFrame, { x: 1, y: 0 }),
            v: world.projectLocal(world.activeFrame, { x: 0, y: 1 }),
          }
        : null,
    });
  },
});
Object.defineProperty(window, "freacHistory", { value: () => editor.store.history() });
world.draw();
void editor.store.request({ kind: "read" });
window.addEventListener(
  "pagehide",
  () => {
    disposeAgent();
    disposeInspection();
    disposeScript();
    toolMenu.dispose();
    modelingTools.dispose();
    disposeControls();
    disposeCalculation();
    modelControls.dispose();
    bodyMove.dispose();
    bodyActions.dispose();
    cleanup.dispose();
    deleteAction.dispose();
    booleans.dispose();
    faceOffsets.dispose();
    shells.dispose();
    faceMoves.dispose();
    edgeMoves.dispose();
    bodyFinishes.dispose();
    disposeModelHighlight();
    disposeBodies();
    bodyEdges.dispose();
    projection.dispose();
    sections.dispose();
    mirror.dispose();
    scaling.dispose();
    disposeVisibility();
    entities.dispose();
    overlaps.dispose();
    constructionPlanes.dispose();
    planeCuts.dispose();
    measurements.dispose();
    gestures.dispose();
    dimensions.dispose();
    disposeDrawing();
    disposeFills();
    selection.dispose();
    transforms.dispose();
    pointChooser.dispose();
    pointEdge.dispose();
    pointTangent.dispose();
    constraints.dispose();
    lineConstraints.dispose();
    curvedConstraints.dispose();
    fillets.dispose();
    bows.dispose();
    beziers.dispose();
    trim.dispose();
    offsets.dispose();
    disposePlaneEntry();
    disposeLabels();
    world.dispose();
  },
  { once: true },
);
