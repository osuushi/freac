# Design reset and scope history

Historical framing, not delivery authorization. Current decisions are in [architecture](../architecture.md).

# Sketch-first application design

Status: implementation design for the 2026-09-14 reset. This replaces the earlier
architecture proposal. The founder has required a complete sketch editor before
solid tools, no subagents, and one operation at a time in a single-user app.
The detailed interaction defaults are proposals to assess at hands-on reviews;
they are not claims about existing behavior. Follow the [development
process](../development-process.md) and roadmap (historical; `git show 4241f50:docs/roadmap.md`) when implementing them.
Founder corrections: splines are outside v1; arc segments remain required;
extrusion accepts its result on completing/exiting the tool, not on drag release;
sketch and 3D views share a visible origin and faint infinite coordinate grids.

Founder update, 2026-09-16: cubic Bézier sketch editing and controlled approximate
projection are now in scope, overriding earlier spline exclusions below. Newly
drawn cubics are their own geometry; projected general curves become cubic pieces
within an explicit geometric tolerance. Preserve analytic primitives when natural.
Keep stable local IDs, but no semantic ancestry/history architecture for recovering
intent. Agent-led precision recovery later operates on current geometry, discloses
assumptions and uses ordinary Undo; it need not require approval for each correction.
