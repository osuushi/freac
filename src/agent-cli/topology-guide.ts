export const topologyGuide = `
## Inspect and replace current topology

Modeling calls can compose: inspect the needed current geometry, compute explicit
construction parameters, then apply them. A missing named tool alone does not settle
whether an edit can be composed from available primitives. Check each primitive's
geometry domain rather than replacing the user's target with a convenient whole body.

Inside makeshift run, await makeshift.topology({body}) reads the current candidate, including
previous edits in this script. It returns faces with analytic plane/cylinder/cone
supports, area, conservative bounds, and ordered loops of edge uses. Edges carry
adjacent face IDs and line/circle geometry. Circle start/end are radians; seam edges
occur twice in loops. Face reversed indicates solid orientation; loop directions are
relative to the forward support. Other surfaces/curves are unclassified, not approximated.
Use rim geometry for a bounded wall's extent, not the whole body's dimensions.

await makeshift.replaceFace({body, face, surface}) replaces one supporting surface and
reconnects its boundaries to neighbors. surface is either
{kind:"cylinder", origin, axis, radius} or
{kind:"cone", origin, axis, radius, semiAngle}.
The axis is unit length; radius is at origin. At signed axial distance t a cone's
radius is radius + t*tan(semiAngle), with semiAngle in degrees. Zero angle is a cylinder.

Current domain: a complete cylindrical/conical wall, coaxial replacement, two full
circular rims, and perpendicular planar neighbors. Inner walls and stepped bodies
are supported. Adjacent planar faces are retrimmed; their support planes remain fixed.
Partial/pierced walls, other neighbor supports, apex crossings and invalid solids reject.
Stable face/edge IDs continue; read-only inspection and identical replacements add no
Undo step. All modeling edits still share the script's atomic acceptance/rollback.

Example: supplied radii 18 and 22 at two verified rim centers, along an explicitly
chosen bottom-to-top direction. Here the request's direction is world +Z:
\`\`\`ts
const selected = makeshift.selection;
if (selected.length !== 1 || selected[0].kind !== "face") throw new Error("Expected one face");
const target = selected[0];
const topology = await makeshift.topology({body: target.body});
const face = topology.faces.find(f => f.id === target.face);
if (!face) throw new Error("Missing face");
const ids = new Set(face.loops.flatMap(l => l.edges.filter(e => !e.seam).map(e => e.edge)));
const edges = topology.edges.filter(e => ids.has(e.id));
if (edges.length !== 2 || edges.some(e => e.curve.kind !== "circle")) throw new Error("Expected circular rims");
const rims = edges.map(e => e.curve).filter(c => c.kind === "circle").sort((a,b) => a.center[2] - b.center[2]);
const height = rims[1].center[2] - rims[0].center[2];
await makeshift.replaceFace({body: target.body, face: target.face, surface: {
  kind: "cone", origin: rims[0].center, axis: [0,0,1], radius: 18,
  semiAngle: Math.atan((22 - 18) / height) * 180 / Math.PI,
}});
\`\`\`
Establish radius versus diameter and the intended direction from the request/context.
This example does not infer either from an unqualified pair of numbers.
`;
