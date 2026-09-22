import * as THREE from "three";
import { Line2 } from "three/addons/lines/Line2.js";
import { LineGeometry } from "three/addons/lines/LineGeometry.js";
import { LineMaterial } from "three/addons/lines/LineMaterial.js";
import { mergeVertices } from "three/addons/utils/BufferGeometryUtils.js";
import type { SketchEditor } from "../sketch/editor.js";
import type { Point } from "../sketch/planes.js";
import { featureEdges } from "./feature-edges.js";

export function pickFace(editor: SketchEditor, screen: Point) {
  if (!editor.bodiesVisible) return undefined;
  const rect = editor.world.canvas.getBoundingClientRect();
  const ray = new THREE.Raycaster();
  ray.setFromCamera(
    new THREE.Vector2(
      ((screen.x - rect.left) / rect.width) * 2 - 1,
      1 - ((screen.y - rect.top) / rect.height) * 2,
    ),
    editor.world.camera,
  );
  let closest: { body: string; face: string; depth: number } | undefined;
  const a = new THREE.Vector3(),
    b = new THREE.Vector3(),
    c = new THREE.Vector3(),
    hit = new THREE.Vector3();
  for (const body of (editor.display.bodies ?? []).filter((body) =>
    editor.visibility.visible(body.id),
  ))
    for (const face of body.faces) {
      for (let i = 0; i < face.vertices.length; i += 9) {
        a.fromArray(face.vertices, i);
        b.fromArray(face.vertices, i + 3);
        c.fromArray(face.vertices, i + 6);
        if (!ray.ray.intersectTriangle(a, b, c, false, hit)) continue;
        const depth = hit.distanceTo(editor.world.camera.position);
        if (!closest || depth < closest.depth) closest = { body: body.id, face: face.id, depth };
      }
    }
  return closest;
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
  light.position.set(40, -60, 90);
  editor.world.scene.add(group, ambient, light);
  let previous = "",
    bodies = editor.display.bodies,
    acceptedBodies = editor.store.data.bodies;
  const clear = () => clearBodyMeshes(group);
  const update = () => {
    group.visible = true;
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
        const material = new THREE.MeshStandardMaterial({
          color,
          roughness: 0.75,
          metalness: 0,
          side: THREE.DoubleSide,
          polygonOffset: true,
          polygonOffsetFactor: 1,
          polygonOffsetUnits: 1,
        });
        group.add(new THREE.Mesh(faceGeometry(face.vertices), material));
      }
      for (const edge of featureEdges(body)) {
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute("position", new THREE.Float32BufferAttribute(edge.points, 3));
        group.add(new THREE.Line(geometry, new THREE.LineBasicMaterial({ color: "#344657" })));
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
          highlight.renderOrder = 20;
          group.add(highlight);
        }
      }
    }
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
