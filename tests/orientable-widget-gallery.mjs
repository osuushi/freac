import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { chromium } from "playwright";
import { createServer } from "vite";

await mkdir(".cache/sketch-review", { recursive: true });
const server = await createServer({ server: { port: 0, watch: null } });
let browser;
try {
  await server.listen();
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({
    viewport: { width: 1000, height: 620 },
    deviceScaleFactor: 2,
  });
  await page.goto(server.resolvedUrls.local[0]);
  await page.evaluate(async (root) => {
    const THREE = await import(`/@fs/${root}/node_modules/.vite/deps/three.js`);
    const { directionalWidget } = await import(`/@fs/${root}/src/model/directional-widget.ts`);
    const { markerMarkup } = await import(`/@fs/${root}/src/sketch/move-widget/marker.ts`);
    const { cameraFacingWidth } = await import(`/@fs/${root}/src/model/widget-frame.ts`);
    const shapes = ["fillet", "chamfer", "extrude", "offset", "shell", "revolve"];
    const views = [
      ["Front", [0, 0, 1]],
      ["Oblique", [2, 1, 3]],
      ["Along edit axis", [1, 0, 0]],
    ];
    const rows = views
      .map(([label, position]) => {
        const camera = new THREE.OrthographicCamera();
        camera.position.fromArray(position);
        camera.lookAt(0, 0, 0);
        return `<div class="row"><span>${label}</span>${shapes.map((shape) => `<div class="cell">${shape === "revolve" ? markerMarkup(camera, [1, 0, 0], [0, 1, 0], true) : directionalWidget(camera, [1, 0, 0], shape, ["extrude", "offset", "shell"].includes(shape) ? cameraFacingWidth(camera, [1, 0, 0]) : [0, 1, 0])}</div>`).join("")}</div>`;
      })
      .join("");
    document.body.innerHTML = `<style>
      body { margin:0; padding:36px; background:#f6f8fb; color:#202b36; font:14px system-ui; }
      h1 { font-size:24px; margin:0 0 8px; } p { margin:0 0 30px; color:#627080; }
      .row { display:grid; grid-template-columns:130px repeat(6,1fr); align-items:center; }
      .row > span { color:#627080; } .cell { height:120px; display:flex; justify-content:center; align-items:center; }
      .cell svg { width:64px; height:64px; } .labels { text-align:center; font-weight:600; height:36px; }
      footer { margin-top:20px; font-size:12px; color:#627080; }
    </style><h1>Orientable tool forms</h1><p>Distinct operation shapes · white capsule contours · fixed geometry frames</p>
      <div class="row labels"><span></span>${shapes.map((s) => `<div>${s[0].toUpperCase() + s.slice(1)}</div>`).join("")}</div>${rows}
      <footer>Projection study. In the editor, edge-on rotation glyphs and their hit targets hide; numeric controls remain available.</footer>`;
  }, resolve("."));
  await page.screenshot({ path: ".cache/sketch-review/orientable-tool-forms.png" });
} finally {
  await browser?.close();
  await server.close();
}
