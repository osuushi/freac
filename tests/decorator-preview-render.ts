import * as THREE from "three";
import {
  DecoratorPreviewCompositor,
  decoratorPreviewLayer,
  type PreviewSurface,
} from "../src/decorators/preview-compositor.js";

export function previewRenderChecks() {
  const renderer = new THREE.WebGLRenderer({ antialias: true, stencil: true });
  renderer.setSize(64, 64);
  document.body.append(renderer.domElement);
  const scene = new THREE.Scene();
  scene.background = new THREE.Color("white");
  const camera = new THREE.OrthographicCamera(-2, 2, 2, -2, 0.1, 20);
  camera.position.z = 10;
  const light = new THREE.AmbientLight("white", 3);
  light.layers.enable(decoratorPreviewLayer);
  scene.add(light);
  const compositor = new DecoratorPreviewCompositor();
  const target = new THREE.WebGLRenderTarget(64, 64, { stencilBuffer: true });
  const support = new THREE.Mesh(
    new THREE.PlaneGeometry(3, 3),
    new THREE.MeshBasicMaterial({ color: "white" }),
  );
  support.position.z = 1;
  support.userData.decoratorFace = "support";
  scene.add(support);
  const surface = (color: string, z: number): PreviewSurface => {
    const material = compositor.previewMaterial();
    material.color.set(color);
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(3, 3), material);
    mesh.layers.set(decoratorPreviewLayer);
    mesh.position.z = z;
    scene.add(mesh);
    return { mesh, faces: new Set(["support"]) };
  };
  const red = surface("red", 0),
    green = surface("lime", 0.4);
  green.mesh.visible = false;
  const pixel = (surfaces: PreviewSurface[], x = 32, y = 32) => {
    renderer.setRenderTarget(target);
    renderer.render(scene, camera);
    const background = scene.background,
      clip = renderer.clippingPlanes;
    compositor.render(renderer, scene, camera, surfaces);
    if (
      renderer.getRenderTarget() !== target ||
      scene.background !== background ||
      renderer.clippingPlanes !== clip ||
      camera.layers.mask !== 1 ||
      !renderer.autoClear
    )
      throw new Error("Compositor did not restore renderer state");
    const bytes = new Uint8Array(4);
    renderer.readRenderTargetPixels(target, x, y, 1, 1, bytes);
    return [...bytes];
  };
  try {
    const revealed = pixel([red]);
    if (revealed[0] < revealed[1] + 50)
      throw new Error(`Recessed preview remains occluded: ${revealed}`);
    const blocker = new THREE.Mesh(
      new THREE.PlaneGeometry(3, 3),
      new THREE.MeshBasicMaterial({ color: "blue" }),
    );
    blocker.position.z = 2;
    scene.add(blocker);
    const blocked = pixel([red]);
    if (blocked[2] < 240 || blocked[0] > 10) throw new Error(`Foreground blocker lost: ${blocked}`);
    blocker.position.z = 0.5;
    const hiddenBlocker = pixel([red]);
    if (hiddenBlocker.slice(0, 3).some((v) => v < 250))
      throw new Error(`Occluder behind own support lost: ${hiddenBlocker}`);
    blocker.visible = false;
    const results = checkLayers(renderer, camera, support, red, green, pixel);
    target.setSize(96, 80);
    renderer.setSize(96, 80);
    const resized = pixel([red], 48, 40);
    if (resized[0] < resized[1] + 50) throw new Error(`Resize lost preview: ${resized}`);
    if (renderer.getContext().getError() !== 0) throw new Error("WebGL error");
    blocker.geometry.dispose();
    blocker.material.dispose();
    return { revealed, blocked, hiddenBlocker, resized, ...results };
  } finally {
    disposeMeshes(scene);
    target.dispose();
    compositor.dispose();
    renderer.dispose();
    renderer.domElement.remove();
  }
}

function disposeMeshes(scene: THREE.Scene): void {
  scene.traverse((object) => {
    if (object instanceof THREE.Mesh) {
      object.geometry.dispose();
      (object.material as THREE.Material).dispose();
    }
  });
}

function checkLayers(
  renderer: THREE.WebGLRenderer,
  camera: THREE.Camera,
  support: THREE.Mesh,
  red: PreviewSurface,
  green: PreviewSurface,
  pixel: (surfaces: PreviewSurface[], x?: number, y?: number) => number[],
) {
  support.visible = false;
  green.mesh.visible = true;
  red.mesh.visible = false;
  const single = pixel([green]);
  red.mesh.visible = true;
  const forward = pixel([red, green]),
    reverse = pixel([green, red]);
  if (String(single) !== String(forward) || String(single) !== String(reverse))
    throw new Error(
      `Preview overlap depends on order or accumulates alpha: ${single}; ${forward}; ${reverse}`,
    );
  green.mesh.visible = false;
  renderer.clippingPlanes = [new THREE.Plane(new THREE.Vector3(1, 0, 0), 0)];
  const clipped = pixel([red], 20, 32),
    retained = pixel([red], 44, 32);
  if (clipped.slice(0, 3).some((v) => v < 250) || retained[0] < retained[1] + 50)
    throw new Error(`Clipping mismatch: ${clipped}; ${retained}`);
  renderer.clippingPlanes = [];
  camera.layers.set(0);
  return { single, forward, reverse, clipped, retained };
}
