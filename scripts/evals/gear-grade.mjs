// Outcome grader for these bounded, external, unshifted Z-axis spur exercises.
// No agent-authored labels, reports or claimed dimensions are trusted here.
import { readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { exportGeometry } from "../../.cache/sketch-tests/src/backend/export-geometry.js";
import { SolidCalculator } from "../../.cache/sketch-tests/src/backend/solid-calculator.js";
import {
  decoratedMeshes,
  initializeMeshRuntime,
} from "../../.cache/sketch-tests/src/decorators/mesh-runtime.js";
import { MeshScope } from "../../.cache/sketch-tests/src/decorators/mesh-scope.js";
import { cases } from "./gear-cases.mjs";

const close = (a, b, t = 1e-6) => Number.isFinite(a) && Math.abs(a - b) < t;
function inspectGears(document, task, check) {
  const bodies = document.bodies ?? [],
    decorators = document.decorators ?? [];
  check(
    bodies.length === task.gears,
    `Expected ${task.gears} separate bodies; got ${bodies.length}`,
  );
  check(
    decorators.length === task.gears,
    `Expected ${task.gears} gear decorators; got ${decorators.length}`,
  );
  const gears = decorators
    .map((d) => {
      const body = bodies.find((b) => b.id === d.faces[0]?.body);
      const face = body?.faces.find((f) => f.id === d.faces[0]?.face);
      if (d.definition !== "freac.gear" || d.problem || !face?.cylinder) {
        check(false, `Unresolved/noncylindrical gear ${d.id}`);
        return null;
      }
      const c = face.cylinder,
        s = d.settings;
      const z = face.vertices.filter((_, i) => i % 3 === 2);
      const g = {
        id: d.id,
        body: body.id,
        x: c.origin[0],
        y: c.origin[1],
        radius: c.radius,
        teeth: s.teeth ?? 40,
        module: (2 * c.radius) / (s.teeth ?? 40),
        lo: Math.min(...z),
        hi: Math.max(...z),
      };
      check(
        c.outward === 1 && close(Math.abs(c.axis[2]), 1),
        `${d.id}: expected external Z-axis cylinder`,
      );
      check(
        close(s.helix ?? 0, 0) && close(s.shift ?? 0, 0),
        `${d.id}: expected unshifted spur gear`,
      );
      check(
        close(s.pressure ?? 20, 20) && close(s.thinning ?? 0, 0.04),
        `${d.id}: pressure/thinning changed`,
      );
      check(
        close(g.module, 1) && close(g.hi - g.lo, 6),
        `${d.id}: module/face width differs from brief`,
      );
      check(Number.isInteger(g.teeth) && g.teeth >= 18, `${d.id}: invalid/undercut tooth count`);
      return g;
    })
    .filter(Boolean);
  check(
    new Set(gears.map((g) => g.body)).size === task.gears,
    "Every requested body must have its own gear decorator",
  );
  return gears;
}

function trainLinks(gears) {
  const links = [];
  for (let a = 0; a < gears.length; a++)
    for (let b = a + 1; b < gears.length; b++) {
      const p = gears[a],
        q = gears[b],
        distance = Math.hypot(p.x - q.x, p.y - q.y);
      const overlap = Math.min(p.hi, q.hi) - Math.max(p.lo, q.lo);
      if (close(distance, 0)) links.push({ a, b, kind: "shaft", factor: 1 });
      else if (close(distance, p.radius + q.radius) && overlap > 5.99) {
        const alpha = (20 * Math.PI) / 180;
        const path = (g) =>
          Math.sqrt((g.radius + g.module) ** 2 - (g.radius * Math.cos(alpha)) ** 2);
        const contactRatio =
          (path(p) + path(q) - distance * Math.sin(alpha)) / (Math.PI * p.module * Math.cos(alpha));
        links.push({ a, b, kind: "mesh", factor: -p.teeth / q.teeth, contactRatio });
      }
    }
  return links;
}

function checkRevision(document, before, check) {
  if (!before) return;
  check(
    JSON.stringify(document.bodies.map((b) => b.id).sort()) ===
      JSON.stringify(before.bodies.map((b) => b.id).sort()),
    "Revision replaced existing bodies",
  );
  for (const d of before.decorators) {
    const current = document.decorators.find((i) => i.id === d.id);
    check(
      !!current &&
        ["teeth", "thinning", "pressure", "helix", "shift"].every(
          (k) => current.settings[k] === d.settings[k],
        ),
      "Revision replaced decorator or changed preserved settings",
    );
    if (close(d.frame.origin[0], 0) && close(d.frame.origin[1], 0))
      check(
        !!current &&
          JSON.stringify(current.frame) === JSON.stringify(d.frame) &&
          current.settings.phase === d.settings.phase,
        "Revision rotated the fixed input",
      );
  }
}

export function trainGeometry(document, task, before) {
  const failures = [];
  const check = (ok, message) => {
    if (!ok) failures.push(message);
  };
  const gears = inspectGears(document, task, check);
  const links = trainLinks(gears);
  check(
    links.filter((l) => l.kind === "mesh").length === (task.gears === 4 ? 2 : 1),
    "Missing expected full-width pitch-tangent meshes",
  );
  check(
    links.filter((l) => l.kind === "shaft").length === (task.gears === 4 ? 1 : 0),
    "Incorrect shared-shaft arrangement",
  );
  check(
    links.filter((l) => l.kind === "mesh").every((l) => l.contactRatio > 1),
    "A mesh lacks continuous theoretical involute contact",
  );
  const input = gears.findIndex((g) => close(g.x, 0) && close(g.y, 0));
  check(input >= 0, "Input axis moved/missing");
  const output = task.output
    ? gears.findIndex((g) => close(g.x, task.output[0]) && close(g.y, task.output[1]))
    : gears.reduce((best, g, i) => (best < 0 || g.x > gears[best].x ? i : best), -1);
  check(output >= 0 && output !== input, "Output axis missing");
  if (!task.output)
    check(
      gears.every((g) => close(g.y, 0) && g.x >= -1e-6),
      "Axes must lie along +X",
    );
  const speeds = new Array(gears.length).fill(null);
  if (input >= 0) speeds[input] = 1;
  for (let n = 0; n < gears.length; n++)
    for (const l of links) {
      if (speeds[l.a] !== null && speeds[l.b] === null) speeds[l.b] = speeds[l.a] * l.factor;
      if (speeds[l.b] !== null && speeds[l.a] === null) speeds[l.a] = speeds[l.b] / l.factor;
    }
  check(
    speeds.every((v) => v !== null),
    "Disconnected train",
  );
  check(
    close(speeds[output], (task.gears === 4 ? 1 : -1) / task.ratio),
    "Incorrect signed output speed ratio",
  );
  for (const l of links)
    check(close(speeds[l.b], speeds[l.a] * l.factor), "Inconsistent gear loop");
  const spans = [
    Math.max(...gears.map((g) => g.x + g.radius + g.module)) -
      Math.min(...gears.map((g) => g.x - g.radius - g.module)),
    Math.max(...gears.map((g) => g.y + g.radius + g.module)) -
      Math.min(...gears.map((g) => g.y - g.radius - g.module)),
    Math.max(...gears.map((g) => g.hi)) - Math.min(...gears.map((g) => g.lo)),
  ];
  check(
    spans.every((v, i) => v <= task.envelope[i] + 1e-6),
    `Envelope exceeded: ${spans.join(" × ")} mm`,
  );
  checkRevision(document, before, check);
  return { failures, gears, links, speeds, spans };
}

function placed(scope, solid, gear, angle) {
  const centered = scope.keep(solid.translate([-gear.x, -gear.y, 0]));
  const rotated = scope.keep(centered.rotate([0, 0, angle]));
  return scope.keep(rotated.translate([gear.x, gear.y, 0]));
}

export async function gradeTrain(document, task, before) {
  const result = trainGeometry(document, task, before);
  const kernel = new SolidCalculator();
  try {
    const refined = await exportGeometry(document, kernel);
    const runtime = await initializeMeshRuntime();
    const meshes = decoratedMeshes(runtime, refined);
    result.closedExportBodies = meshes.length;
    result.probes = [];
    // Every pair: engaged pairs traverse one tooth pitch; other parts traverse an
    // input revolution. Samples are collision evidence, not continuous-motion proof.
    for (let a = 0; a < result.gears.length; a++)
      for (let b = a + 1; b < result.gears.length; b++) {
        const ga = result.gears[a],
          gb = result.gears[b];
        const link = result.links.find((l) => l.a === a && l.b === b && l.kind === "mesh");
        const scope = new MeshScope(runtime);
        try {
          const ma = scope.from(meshes[document.bodies.findIndex((x) => x.id === ga.body)]);
          const mb = scope.from(meshes[document.bodies.findIndex((x) => x.id === gb.body)]);
          let maxVolume = 0,
            worstSample = 0;
          const samples = link ? 16 : 24;
          for (let sample = 0; sample <= samples; sample++) {
            const step = new MeshScope(runtime);
            try {
              const angle = (sample / samples) * (link ? 360 / ga.teeth : 360);
              const aa = link ? angle : angle * (result.speeds[a] ?? 0);
              const ab = link ? (-angle * ga.teeth) / gb.teeth : angle * (result.speeds[b] ?? 0);
              const volume = step
                .keep(placed(step, ma, ga, aa).intersect(placed(step, mb, gb, ab)))
                .volume();
              if (volume > maxVolume) {
                maxVolume = volume;
                worstSample = sample;
              }
            } finally {
              step.close();
            }
          }
          result.probes.push({
            a: ga.id,
            b: gb.id,
            kind: link ? "tooth-period" : "input-revolution",
            samples: samples + 1,
            maxVolume,
            worstSample,
          });
          if (maxVolume > 1e-5)
            result.failures.push(
              `${ga.id}/${gb.id}: sampled interference ${maxVolume.toFixed(6)} mm³`,
            );
        } finally {
          scope.close();
        }
      }
  } catch (error) {
    result.failures.push(`Export/probe failed: ${error.message}`);
  } finally {
    kernel.close();
  }
  result.passed = result.failures.length === 0;
  return result;
}

if (process.argv[1] && resolve(process.argv[1]) === import.meta.filename) {
  for (const directory of process.argv.slice(2)) {
    const metadata = JSON.parse(await readFile(join(directory, "metadata.json"), "utf8"));
    const document = JSON.parse(await readFile(join(directory, "document.json"), "utf8"));
    const before = cases[metadata.name].fixture
      ? JSON.parse(await readFile(join(directory, "before.json"), "utf8"))
      : undefined;
    const result = await gradeTrain(document, cases[metadata.name], before);
    await writeFile(join(directory, "grade.json"), JSON.stringify(result, null, 2));
    console.log(JSON.stringify({ directory, ...result }));
  }
}
