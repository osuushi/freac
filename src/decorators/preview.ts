import * as THREE from "three";
import type { ExportMesh } from "../model/export-mesh.js";
import type { SketchEditor } from "../sketch/editor.js";
import { stableClipping } from "../sketch/stable-clipping.js";

function overlayMesh(body: string, mesh: ExportMesh): THREE.Mesh {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(mesh.vertices.flat(), 3));
  geometry.setIndex(mesh.triangles.flat());
  geometry.computeVertexNormals();
  const material = stableClipping(
    new THREE.MeshStandardMaterial({
      color: "#258c96",
      transparent: true,
      opacity: 0.45,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
      side: THREE.DoubleSide,
    }),
  );
  const overlay = new THREE.Mesh(geometry, material);
  overlay.userData.body = body;
  overlay.raycast = () => {};
  overlay.renderOrder = 3;
  return overlay;
}

export function decoratorOverlay(editor: SketchEditor): () => void {
  const group = new THREE.Group();
  editor.world.scene.add(group);
  let worker: Worker | null = null,
    key = "",
    timer: ReturnType<typeof setTimeout> | undefined;
  const clear = () => {
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
    const next = JSON.stringify([
      document.decorators,
      document.decoratorDefinitions,
      editor.store.decoratorSources,
      document.bodies?.map((b) => b.brep),
    ]);
    if (next === key) return;
    key = next;
    clearTimeout(timer);
    worker?.terminate();
    worker = null;
    clear();
    if (!document.decorators?.length) return;
    timer = setTimeout(() => {
      worker = new Worker(new URL("./preview-worker.ts", import.meta.url), { type: "module" });
      const current = worker;
      worker.onmessage = (
        event: MessageEvent<{ meshes?: { body: string; mesh: ExportMesh }[]; error?: string }>,
      ) => {
        if (worker !== current) return;
        worker.terminate();
        worker = null;
        if (event.data.error) {
          editor.notice = `Decorator preview: ${event.data.error}`;
          editor.refresh();
        }
        for (const { body, mesh } of event.data.meshes ?? []) {
          const overlay = overlayMesh(body, mesh);
          overlay.visible = editor.visibility.visible(body);
          group.add(overlay);
        }
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
    editor.world.changed.delete(update);
    editor.world.scene.remove(group);
  };
}
