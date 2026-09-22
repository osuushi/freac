# Architecture discipline

Read when this procedure is needed. [Process overview](../development-process.md).

## Every abstraction must earn its place

Before adding a service, queue, registry, schema layer, dependency or compatibility
mechanism, answer: **Which currently accepted interaction fails without it, and
why is a direct implementation insufficient?** Record a short answer in the brief
or commit if the choice is consequential. If there is no concrete answer, omit it.

For this application:

- One document owner and one edit at a time are sufficient. Block editing while
  busy and show a delayed busy indicator. Keep the window able to repaint.
- Do not add document revision preconditions, idempotency/retry ledgers,
  optimistic concurrent edits, automatic replay, reconnect recovery, CRDTs,
  event sourcing or a multi-user architecture. They are not needed to deliver
  this product under the agreed execution model.
- Undo and file saving solve user problems directly. They do not justify a
  general transaction service, persistent command log or historical graph engine.
- Stable IDs identify geometry within a document. They are not invitations to
  design a versioned reference protocol. Render indexes are not model identity.
- A solver or geometry library provides calculations. It does not get a second
  authoritative document, its own application history, or permission to define UX.
- No speculative plug-in framework, generic tool engine, DI container, schema
  generator, remote service stack or storage migration framework.
- Future tablet and agent support require clean dependencies and callable edits.
  They do not require a production remote-hosting or agent-execution stack during
  sketch work.

Prefer a small named function or concrete module. Share behavior when its semantics
are actually the same; do not duplicate an editing path for each shape either.

## Keep architecture visible in the code

The design assigns responsibility to document editing, interactions, geometry,
solving, presentation and host services. These are module boundaries, not a list
of packages or processes to scaffold. Start with ordinary modules in the existing
project; extract a package only when a real second consumer needs it.

The composition root wires modules. It must not implement geometry algorithms,
tool state machines, persistence validation and unrelated event routing itself.
Warn above 300 source lines or 80 function lines. Inspect files approaching those
limits, including the largest touched files, during review. Split by responsibility;
do not compress code, suppress warnings or create chains of tiny forwarding files
to land at 299 lines. Tests also need coherent fixtures and readable scenarios.

TypeScript stays strict and uses Biome. Preserve Electron desktop and a shared
frontend compatible with WebKit. Avoid macOS-only assumptions in new code; Linux
and Windows remain build targets. A platform claim requires a build on that target.
