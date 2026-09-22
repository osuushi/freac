# Platforms and embedded agent

Detailed product requirements, not implementation status. [Architecture overview](../architecture.md).
The 2026-09-16 cubic/projection decision supersedes earlier spline exclusions.
The current user request determines active work; these requirements do not authorize a work queue.

# Product contract

Current delivery order, reset 2026-09-14: a complete sketch editor first, then
solid tools one at a time, each designed and reviewed before implementation.
The [development process](../development-process.md) and [sketch-first
design](../architecture.md) replace the old proof sequence and revision protocol.
The requirements below describe product intent, not existing capabilities. Sketch v1 includes arc segments;
splines and their supporting implementation are deferred beyond v1.

Founder update, 2026-09-16: cubic Bézier editing and bounded approximation for
projection supersede the earlier spline deferral. Support projecting sketch/body
curves and selected face-set boundaries into an active sketch or onto a coordinate
plane/planar face to create/reuse a sketch. Include hole boundaries and exclude
shared internal edges of the selected faces.
Copies are independent, perpendicular and not clipped by face boundaries. Preview
and accept in one Undo. Favor pen-style editing over general NURBS controls;
precision/analytic recognition can be recovered explicitly from current geometry.

Freac aims for direct, spatial CAD editing with an agent beside the user.
The user makes design decisions; the agent performs bounded modeling, parameter
changes, diagnosis and recovery through the same editing functions. Desktop input
comes first. A shared browser frontend should enable remote and tablet use
without rebuilding the interaction model around video streaming.

Founder decision, 2026-09-14: Freac will be open source; LGPL is acceptable for
this end-user application, and PlaneGCS is selected for constraint solving.
The intended tablet configuration is an iPad controlling modeling hosted on the
user's desktop over the local network. An Internet-separated service or an
offline iPad modeling backend is not the current target.

Desktop targets are macOS, Linux and Windows; Linux/Windows must at least be
buildable even before binaries are distributed. The shared frontend must work
on WebKit, with actual iPad Safari touch/Pencil checks. Electron desktop testing
does not substitute for that acceptance.

Intuitive basic editing and an embedded coding agent are the project's two core
product commitments. The agent must have direct access to both frontend and
backend code so it can work with the user, inspect and change the application,
and perform modeling tasks. This access is part of the intended experience,
not merely a developer workflow or a later optional chatbot integration.

Founder direction, 2026-09-20: bring your own terminal harness, Codex first,
with configurable executable/environment and a Freac-isolated preset. Portable
document workspaces carry notes/scripts/optional skills; local CLI tools provide
document-scoped inspection, rendering and typed scripting without MCP. The terminal
docks right or below and collapses without stopping. Detached windows are deferred.
The [agent-shell proposal](../architecture/agent-shell.md) owns the current design
discussion and researched canvas Ghostty-web candidate; dependency acceptance is pending.

The initial intended agent experience is Codex through an embedded terminal emulator.
The terminal presents a coding session connected to the project workspace;
the agent needs source, executable modeling access and feedback from the live
model. Source access alone does not establish that it can perform modeling tasks.
User and agent modeling changes use the same edit functions, validation and Undo
behavior, with one edit at a time. While an operation runs, conflicting editing
is blocked; show a busy indicator when needed. A single user and their agent do
not require concurrent mutation, public revisions or retry/idempotency protocols.
Application code edits have their own
build/reload lifecycle and must preserve or recover the active document.

This document carries forward explicit founder requirements from the Freak
prototype discussion, including the 2026-09-13 boundary-preservation decision.
It describes desired behavior, not implemented Freac features.
