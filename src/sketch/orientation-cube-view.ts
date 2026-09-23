import * as THREE from "three";
import type { World } from "./world.js";

const faces = [
  { name: "Front", normal: [0, -1, 0], up: [0, 0, 1] },
  { name: "Back", normal: [0, 1, 0], up: [0, 0, 1] },
  { name: "Right", normal: [1, 0, 0], up: [0, 0, 1] },
  { name: "Left", normal: [-1, 0, 0], up: [0, 0, 1] },
  { name: "Top", normal: [0, 0, 1], up: [0, 1, 0] },
  { name: "Bottom", normal: [0, 0, -1], up: [0, -1, 0] },
];
const svgNamespace = "http://www.w3.org/2000/svg";

/** A camera-only control, outside the modeling overlay's input surface. */
export function createOrientationCube(world: World) {
  const cube = document.createElementNS(svgNamespace, "svg");
  cube.classList.add("orientation-cube");
  cube.setAttribute("viewBox", "0 0 144 144");
  cube.setAttribute("aria-label", "Orientation cube. Drag to rotate; click a face to align.");
  const title = document.createElementNS(svgNamespace, "title");
  title.textContent = "Drag to rotate · Click a face to align";
  cube.append(title);
  const entries = faces.map((face) => {
    const group = document.createElementNS(svgNamespace, "g");
    group.setAttribute("role", "button");
    group.setAttribute("aria-label", `${face.name} view`);
    const polygon = document.createElementNS(svgNamespace, "polygon");
    const label = document.createElementNS(svgNamespace, "text");
    label.textContent = face.name.toUpperCase();
    group.append(polygon, label);
    cube.append(group);
    const normal = new THREE.Vector3(...face.normal);
    const up = new THREE.Vector3(...face.up);
    return { face, group, polygon, label, normal, up, right: up.clone().cross(normal) };
  });
  world.host.append(cube);
  const draw = () => {
    const inverse = world.camera.quaternion.clone().invert();
    for (const { group, polygon, label, normal, up, right } of entries) {
      const direction = normal.clone().applyQuaternion(inverse);
      const visible = direction.z > 0.015;
      group.style.display = visible ? "" : "none";
      group.setAttribute("tabindex", visible ? "0" : "-1");
      if (!visible) continue;
      const points = [
        [-1, -1],
        [1, -1],
        [1, 1],
        [-1, 1],
      ].map(([x, y]) => {
        const p = normal
          .clone()
          .addScaledVector(right, x)
          .addScaledVector(up, y)
          .applyQuaternion(inverse);
        return `${72 + p.x * 33},${72 - p.y * 33}`;
      });
      polygon.setAttribute("points", points.join(" "));
      polygon.setAttribute(
        "fill",
        `rgb(${Math.round(222 + direction.z * 30)} ${Math.round(227 + direction.z * 25)} ${Math.round(234 + direction.z * 18)})`,
      );
      label.setAttribute("x", String(72 + direction.x * 33));
      label.setAttribute("y", String(72 - direction.y * 33));
      label.style.visibility = direction.z > 0.18 ? "visible" : "hidden";
    }
  };
  return { cube, entries, draw };
}
