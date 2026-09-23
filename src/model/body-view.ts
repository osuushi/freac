import * as THREE from "three";
import { Line2 } from "three/addons/lines/Line2.js";
import { LineGeometry } from "three/addons/lines/LineGeometry.js";
import { LineMaterial } from "three/addons/lines/LineMaterial.js";
import { mergeVertices } from "three/addons/utils/BufferGeometryUtils.js";
import type { SketchEditor } from "../sketch/editor.js";
import { coplanar, type PlaneFrame, type Point } from "../sketch/planes.js";
import { stableClipping } from "../sketch/stable-clipping.js";
import { foregroundBodyLayer } from "../sketch/world-foreground.js";
import type { Body } from "./body.js";
import { faceRayHits, screenRay } from "./body-ray-hits.js";
import { featureEdges } from "./feature-edges.js";

export function pickFace(editor: SketchEditor, screen: Point) {
  if (!editor.bodiesVisible) return undefined;
  const bodies = (editor.display.bodies ?? []).filter((b) => editor.visibility.visible(b.id));
  return faceRayHits(
    bodies,
    screenRay(editor, screen),
    editor.world.camera.position,
    editor.world.renderer.clippingPlanes,
  )[0];
}

function faceGeometry(vertices: number[]): THREE.BufferGeometry {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(vertices, 3));
  // Kernel presentation currently sends triangulated, non-indexed face
  // vertices. Weld the triangles within each face before computing normals;
  // otherwise every triangle gets a separate normal and curved previews
  // appear faceted. Faces remain separate so hard body edges stay sharp.
  const smoothGeometry = mergeVertices(geometry, 1e-5);
  geometry.dispose();
  smoothGeometry.computeVertexNormals();
  return smoothGeometry;
}

export function bodyView(editor: SketchEditor): () => void {
  const group = new THREE.Group();
  const ambient = new THREE.HemisphereLight(0xffffff, 0x778899, 2);
  const light = new THREE.DirectionalLight(0xffffff, 2);
  ambient.layers.enable(foregroundBodyLayer);
  light.layers.enable(foregroundBodyLayer);
  light.position.set(40, -60, 90);
  editor.world.scene.add(group, ambient, light);
  let previous = "",
    bodies = editor.display.bodies,
    acceptedBodies = editor.store.data.bodies;
  let faceMaterials: { plane: PlaneFrame | null; material: THREE.MeshStandardMaterial }[] = [];
  const clear = () => {
    faceMaterials = [];
    clearBodyMeshes(group);
  };
  const update = () => {
    group.visible = true;
    const section = editor.world.activeFrame ?? editor.world.crossSection;
    // Stencil bit 4 gives actual coplanar faces ownership over generated caps.
    // Update only materials while moving the section, not body tessellation.
    const stencil = (plane: PlaneFrame | null) =>
      section && plane && coplanar(section, plane) ? 6 : 2;
    for (const { plane, material } of faceMaterials) material.stencilRef = stencil(plane);
    const selectedBodies = editor.modeling.targets
      .filter((t) => t.kind === "body")
      .map((t) => t.body);
    const selected = editor.modeling.targets.filter((t) => t.kind === "face").map((t) => t.face);
    const selectedEdges = editor.modeling.targets
      .filter((t) => t.kind === "edge")
      .map((t) => t.edge);
    const hover = editor.modeling.hover;
    const key = `${selectedEdges}:${hover?.kind === "edge" ? hover.edge : ""}:${editor.bodiesVisible}:${editor.visibility.key}:${selectedBodies}:${editor.world.active}:${selected}:${hover?.kind === "face" ? hover.face : ""}`;
    if (
      bodies === editor.display.bodies &&
      acceptedBodies === editor.store.data.bodies &&
      key === previous
    )
      return;
    acceptedBodies = editor.store.data.bodies;
    bodies = editor.display.bodies;
    previous = key;
    clear();
    for (const body of bodies ?? []) {
      if (!editor.visibility.visible(body.id)) continue;
      if (!editor.bodiesVisible && editor.store.data.bodies?.some((b) => b.id === body.id))
        continue;
      for (const face of body.faces) {
        const color =
          selected.includes(face.id) || selectedBodies.includes(body.id)
            ? "#82b5e0"
            : hover?.kind === "face" && hover.face === face.id
              ? "#ead3aa"
              : "#cad4df";
        const material = bodyMaterial(color);
        material.stencilRef = stencil(face.plane);
        faceMaterials.push({ plane: face.plane, material });
        group.add(new THREE.Mesh(faceGeometry(face.vertices), material));
      }
      addBodyEdges(group, body, editor, selectedEdges);
    }
    group.traverse((object) => object.layers.enable(foregroundBodyLayer));
  };
  editor.world.changed.add(update);
  return () => {
    editor.world.changed.delete(update);
    clear();
    editor.world.scene.remove(group, ambient, light);
  };
}

function clearBodyMeshes(group: THREE.Group): void {
  for (const object of [...group.children]) {
    const mesh = object as THREE.Mesh<THREE.BufferGeometry, THREE.Material>;
    mesh.geometry.dispose();
    mesh.material.dispose();
    group.remove(mesh);
  }
}

function bodyMaterial(color: string): THREE.MeshStandardMaterial {
  return stableClipping(
    new THREE.MeshStandardMaterial({
      color,
      roughness: 0.75,
      metalness: 0,
      side: THREE.DoubleSide,
      stencilWrite: true,
      stencilRef: 2,
      stencilWriteMask: 6,
      stencilFunc: THREE.AlwaysStencilFunc,
      stencilZPass: THREE.ReplaceStencilOp,
      polygonOffset: true,
      polygonOffsetFactor: 1,
      polygonOffsetUnits: 1,
    }),
  );
}

function addBodyEdges(
  group: THREE.Group,
  body: Body,
  editor: SketchEditor,
  selectedEdges: string[],
): void {
  const hover = editor.modeling.hover;
  for (const edge of featureEdges(body)) {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(edge.points, 3));
    group.add(
      new THREE.Line(geometry, stableClipping(new THREE.LineBasicMaterial({ color: "#344657" }))),
    );
  }
  // During an edge finish, highlight its source chain even when the preview consumes it.
  const source =
    editor.interactions.current?.kind === "body-edge-finish"
      ? (editor.store.data.bodies?.find((b) => b.id === body.id) ?? body)
      : body;
  for (const edge of featureEdges(source)) {
    const selected = selectedEdges.includes(edge.id);
    if (selected || (hover?.kind === "edge" && hover.edge === edge.id)) {
      const highlightGeometry = new LineGeometry();
      highlightGeometry.setPositions(edge.points);
      const highlight = new Line2(
        highlightGeometry,
        new LineMaterial({
          color: selected ? "#1676d2" : "#e18a16",
          linewidth: 4,
          depthTest: false,
          depthWrite: false,
        }),
      );
      stableClipping(highlight.material);
      highlight.renderOrder = 20;
      group.add(highlight);
    }
  }
}
