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
import { PreviewQueue } from "./preview-queue.js";
import { threadDefinition } from "./thread-settings.js";
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

function previewAttachmentKey(document: SketchDocument): string {
  return JSON.stringify(
    document.decorators?.map(({ id, definition, faces, problem, settings }) => ({
      id,
      definition,
      faces,
      problem,
      settings,
    })),
  );
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
  let previous: SketchDocument | null = null;
  let sourcesKey = "";
  let attachmentKey = "";
  let settleTimer: ReturnType<typeof setTimeout> | undefined;
  const clear = () => {
    surfaces.length = 0;
    for (const child of [...group.children]) {
      const mesh = child as THREE.Mesh<THREE.BufferGeometry, THREE.Material>;
      mesh.geometry.dispose();
      mesh.material.dispose();
      group.remove(mesh);
    }
  };
  const queue = new PreviewQueue(
    (response) => {
      clear();
      showMeshes(response.meshes ?? [], group, surfaces, compositor, editor);
      if (response.error) {
        editor.notice = `Decorator preview: ${response.error}`;
        editor.refresh();
      }
      editor.world.draw();
    },
    () => {
      editor.notice = "Decorator preview unavailable";
      editor.refresh();
    },
  );
  const update = () => {
    group.visible = editor.bodiesVisible;
    for (const child of group.children)
      child.visible = editor.visibility.visible(child.userData.body);
    const document = editor.display;
    const nextSources = JSON.stringify(editor.store.decoratorSources);
    if (document === previous && nextSources === sourcesKey) return;
    const nextAttachments = previewAttachmentKey(document);
    if (nextSources !== sourcesKey || nextAttachments !== attachmentKey) clear();
    previous = document;
    sourcesKey = nextSources;
    attachmentKey = nextAttachments;
    clearTimeout(settleTimer);
    if (!document.decorators?.length) {
      queue.clear();
      clear();
      return;
    }
    const live = editor.candidate !== null;
    queue.submit(document, editor.store.decoratorSources, live);
    const hasDeferred = document.decorators.some(
      (instance) =>
        instance.definition !== threadDefinition &&
        document.decoratorDefinitions?.some(
          (definition) =>
            definition.id === instance.definition &&
            definition.version === instance.version &&
            definition.preview &&
            !definition.livePreview,
        ),
    );
    if (live && hasDeferred) {
      // Non-live JavaScript previews render after the gesture pauses. Live work
      // starts immediately and coalesces to the newest candidate while busy.
      settleTimer = setTimeout(() => {
        if (editor.display === document && sourcesKey === nextSources)
          queue.submit(document, editor.store.decoratorSources, false);
      }, 100);
    }
  };
  editor.world.changed.add(update);
  return () => {
    clearTimeout(settleTimer);
    queue.dispose();
    clear();
    editor.world.renderOverlays.delete(render);
    compositor.dispose();
    editor.world.changed.delete(update);
    editor.world.scene.remove(group);
  };
}
