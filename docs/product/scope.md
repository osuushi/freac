# Product scope boundaries

Detailed product requirements, not implementation status. [Architecture overview](../architecture.md).
The 2026-09-16 cubic/projection decision supersedes earlier spline exclusions.
The current user request determines active work; these requirements do not authorize a work queue.

## Scope and boundaries

The first product milestone is a complete, usable sketch editor: creation,
selection, moving/resizing, dimensions and constraints, curve modification,
compound regions, Undo/Redo and Save/Open. The design records its proposed full
tool inventory and earlier review checkpoints. An early rectangle review is not
permission to leave sketching incomplete and resume solid or terminal work.

After sketch acceptance, plan and deliver extrusion, revolution and further solid
tools individually. Sketch fillets/chamfers belong to sketch work; solid edge
fillets/chamfers belong to later body tools. Import/export, assemblies and expanded
agent tooling follow explicit product priorities. The embedded agent's direct
frontend/backend source access remains a core commitment, but does not require a
second document owner or concurrency protocol. Remote/tablet goals constrain
dependencies and interaction choices; they do not authorize speculative services.

Do not build a new geometry kernel or a new general constraint solver as the
initial strategy. Evaluate component reuse. Own product semantics, history,
selection intent and interaction state rather than mirroring a host application's
object tree. Preserve the old prototype as behavioral evidence; its UI and tests
are not product acceptance for Freac.
