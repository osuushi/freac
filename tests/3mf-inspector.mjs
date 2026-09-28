import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const root = await mkdtemp(join(tmpdir(), "freac-3mf-inspector-"));
const python = process.env.FREAC_PYTHON ?? "python3";
const path = join(root, "fixture.3mf");
const make = (component) =>
  execFileSync(python, [
    "-c",
    `
import sys,zipfile
xml='''<model xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02" xmlns:p="http://schemas.microsoft.com/3dmanufacturing/production/2015/06" unit="inch"><resources><object id="1" name="Tetra"><mesh><vertices><vertex x="0" y="0" z="0"/><vertex x="1" y="0" z="0"/><vertex x="0" y="1" z="0"/><vertex x="0" y="0" z="1"/></vertices><triangles><triangle v1="0" v2="2" v3="1"/><triangle v1="0" v2="1" v3="3"/><triangle v1="0" v2="3" v3="2"/><triangle v1="1" v2="2" v3="3"/></triangles></mesh></object><object id="2"><components>'''+sys.argv[2]+'''</components></object></resources><build><item objectid="2" transform="1 0 0 0 1 0 0 0 1 0 2 0"/><item objectid="1"/></build></model>'''
with zipfile.ZipFile(sys.argv[1],'w') as z:z.writestr('3D/3dmodel.model',xml)
`,
    path,
    component,
  ]);
const run = () =>
  JSON.parse(
    execFileSync(python, ["agent-skills/mesh-recovery/scripts/inspect_3mf.py", path], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    }),
  );
try {
  make('<component objectid="1" transform="1 0 0 0 1 0 0 0 1 1 0 0"/>');
  const data = run();
  assert.equal(data.parts.length, 2);
  assert.equal(data.parts[0].closed_oriented_by_indices, true);
  assert.deepEqual(data.parts[0].bounds_mm, [
    [25.4, 50.8, 0],
    [50.8, 76.19999999999999, 25.4],
  ]);
  assert.deepEqual(data.parts[1].bounds_mm, [
    [0, 0, 0],
    [25.4, 25.4, 25.4],
  ]);
  make('<component objectid="2"/>');
  assert.throws(run, /recursive component/);
  make('<component objectid="1" p:path="other.model"/>');
  assert.throws(run, /External component/);
  console.log(
    "PASS 3MF inspector: units, nested transforms, repeated parts, topology, recursive/external reference errors",
  );
} finally {
  await rm(root, { recursive: true, force: true });
}
