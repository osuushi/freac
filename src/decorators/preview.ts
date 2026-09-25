import * as THREE from "three";
import type { ExportMesh } from "../model/export-mesh.js";
import type { SketchDocument } from "../sketch/document.js";
import type { SketchEditor } from "../sketch/editor.js";
import {
  DecoratorPreviewCompositor,
  decoratorPreviewLayer,
  type PreviewSurface,
  previewFaceKey,
} from "./preview-compositor.js";
import type { FaceReference } from "./types.js";

function overlayMesh(
  body: string,
  mesh: ExportMesh,
  compositor: DecoratorPreviewCompositor,
): THREE.Mesh {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(mesh.vertices.flat(), 3));
  geometry.setIndex(mesh.triangles.flat());
  geometry.computeVertexNormals();
  const material = compositor.previewMaterial();
  const overlay = new THREE.Mesh(geometry, material);
  overlay.userData.body = body;
  overlay.raycast = () => {};
  overlay.layers.set(decoratorPreviewLayer);
  return overlay;
}

function showMeshes(
  meshes: { body: string; faces: FaceReference[]; mesh: ExportMesh }[],
  group: THREE.Group,
  surfaces: PreviewSurface[],
  compositor: DecoratorPreviewCompositor,
  editor: SketchEditor,
): void {
  for (const { body, faces, mesh } of meshes) {
    const overlay = overlayMesh(body, mesh, compositor);
    overlay.visible = editor.visibility.visible(body);
    group.add(overlay);
    surfaces.push({
      mesh: overlay,
      faces: new Set(faces.map((f) => previewFaceKey(f.body, f.face))),
    });
  }
}

export function decoratorOverlay(editor: SketchEditor): () => void {
  const group = new THREE.Group();
  const compositor = new DecoratorPreviewCompositor();
  const surfaces: PreviewSurface[] = [];
  const render = () => {
    if (group.visible)
      compositor.render(editor.world.renderer, editor.world.scene, editor.world.camera, surfaces);
  };
  editor.world.renderOverlays.add(render);
  editor.world.scene.add(group);
  let worker: Worker | null = null,
    previous: SketchDocument | null = null,
    sourcesKey = "",
    timer: ReturnType<typeof setTimeout> | undefined;
  const clear = () => {
    surfaces.length = 0;
    for (const child of [...group.children]) {
      const mesh = child as THREE.Mesh<THREE.BufferGeometry, THREE.Material>;
      mesh.geometry.dispose();
      mesh.material.dispose();
      group.remove(mesh);
    }
  };
  const update = () => {
    group.visible = editor.bodiesVisible;
    for (const child of group.children)
      child.visible = editor.visibility.visible(child.userData.body);
    const document = editor.display;
    const nextSources = JSON.stringify(editor.store.decoratorSources);
    if (document === previous && nextSources === sourcesKey) return;
    previous = document;
    sourcesKey = nextSources;
    clearTimeout(timer);
    worker?.terminate();
    worker = null;
    clear();
    if (!document.decorators?.length) return;
    timer = setTimeout(() => {
      worker = new Worker(new URL("./preview-worker.ts", import.meta.url), { type: "module" });
      const current = worker;
      worker.onmessage = (
        event: MessageEvent<{
          meshes?: { body: string; faces: FaceReference[]; mesh: ExportMesh }[];
          error?: string;
        }>,
      ) => {
        if (worker !== current) return;
        worker.terminate();
        worker = null;
        if (event.data.error) {
          editor.notice = `Decorator preview: ${event.data.error}`;
          editor.refresh();
        }
        showMeshes(event.data.meshes ?? [], group, surfaces, compositor, editor);
        editor.world.draw();
      };
      worker.onerror = () => {
        if (worker !== current) return;
        worker.terminate();
        worker = null;
        editor.notice = "Decorator preview unavailable";
        editor.refresh();
      };
      worker.postMessage({ document, sources: editor.store.decoratorSources });
    }, 100);
  };
  editor.world.changed.add(update);
  return () => {
    clearTimeout(timer);
    worker?.terminate();
    clear();
    editor.world.renderOverlays.delete(render);
    compositor.dispose();
    editor.world.changed.delete(update);
    editor.world.scene.remove(group);
  };
}
