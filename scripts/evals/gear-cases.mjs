// Behavioral prompts intentionally omit a construction recipe and expected tooth counts.
export const cases = {
  pair: {
    ratio: 3,
    gears: 2,
    envelope: [110, 80, 8],
    prompt:
      "Build a 3:1 speed reduction using two external spur gears on parallel Z axes in the XY plane. Keep the input axis at (0,0), put the output on +X, use normal module 1 mm, 20 degree pressure angle, zero profile shift, 6 mm face width and 0.04 mm tooth thinning on each gear. Choose suitable tooth counts. Model just the two separate gears with Makeshift's gear decorators, no shafts or housing. The decorated train must fit in a 110 by 80 mm XY footprint. Check the result and explain what you verified and any limitations.",
  },
  compound: {
    ratio: 12,
    gears: 4,
    envelope: [150, 85, 16],
    prompt:
      "Build a compact two-stage 12:1 speed reduction with four external spur gears on three parallel Z axes. The middle two gears are rigidly coupled on one shaft. Keep the input axis at (0,0), and lay out the other axes along +X. Use normal module 1 mm, 20 degree pressure angle, zero profile shift, 6 mm face widths and 0.04 mm tooth thinning on each gear. Fit the decorated train within a 150 by 85 by 16 mm envelope. Model the four gears as separate bodies with Makeshift gear decorators; no shafts or housing, but make their shared-shaft arrangement explicit. Check the result and explain what you verified and any limitations.",
  },
  revision: {
    ratio: 3,
    gears: 2,
    envelope: [110, 110, 8],
    output: [32, 24],
    fixture: true,
    prompt:
      "Revise the existing 3:1 external spur pair: move the output axis from (40,0) to (32,24) mm, keeping both axes parallel to Z and the input fixed at (0,0). Preserve the existing bodies, ratio, module, face widths and tooth thinning. Keep the teeth correctly meshed at the new location. Check the resulting model and explain what you verified and any limitations.",
  },
  oblique: {
    ratio: 2,
    gears: 2,
    envelope: [110, 110, 8],
    output: [27, 36],
    prompt:
      "Build a 2:1 speed reduction using two external spur gears, with input axis at (0,0) and output axis at (27,36) mm, both parallel to Z. Use normal module 1 mm, 20 degree pressure angle, zero profile shift, 6 mm face width and 0.04 mm tooth thinning per gear. Model only two separate decorated gear bodies. Check the mesh and explain what is verified and what remains unverified.",
  },
};

export const revisionFixture = `
for (const [x, teeth, phase] of [[0,20,0],[40,60,3]]) {
 const s = await makeshift.createSketch({plane:"XY",curves:[{kind:"circle",center:{x,y:0},radius:teeth/2}]});
 const before = new Set((await makeshift.decorators()).instances.flatMap(i => i.faces.map(f => f.body)));
 const result = await makeshift.extrude({sources:s.profiles,distance:6,mode:"new"});
 const body = result.bodies.find(b => !before.has(b.id))!;
 const topology = await makeshift.topology({body:body.id});
 const face = topology.faces.find(f => f.surface.kind === "cylinder")!;
 await makeshift.editDecorator({action:"apply",definition:"freac.gear",faces:[{body:body.id,face:face.id}],settings:{teeth,phase,thinning:0.04}});
}`;
