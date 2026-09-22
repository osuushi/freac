# Development process reset

Historical rationale. The current [startup route](../../AGENTS.md) replaces the resume reading list below.

# Development process

Status: 2026-09-14 reset. The founder's instructions establish sketch-first
delivery, direct implementation without subagents, and a single-user application
that performs one edit at a time. This document makes those instructions
operational. The companion [design](../architecture.md) defines the implementation;
the roadmap (historical; `git show 4241f50:docs/roadmap.md`) owns delivery order, current position and review points.

## What success means

The next product milestone is a useful, complete sketch editor. A person must
be able to create **and edit** geometry, combine it into useful profiles, constrain
it, and save their work. Extrude, revolve and subsequent solid tools follow that
milestone, each with its own interaction design. The embedded coding agent remains
a core product commitment; expanding its integration does not precede sketching.

Progress is a newly usable interaction or a fixed user-visible failure. Native
builds, module counts, test counts, document counts and infrastructure coverage
are supporting work. They are not substitutes for that progress.

## Authority and ownership

- The founder owns product intent and judges the interaction at review points.
- The primary agent owns design, implementation, tests, integration, cleanup and
  commits. No subagents unless the founder explicitly changes this instruction.
- Read this document, [the design](../architecture.md), the roadmap (historical; `git show 4241f50:docs/roadmap.md`) and
  the product contract (historical; `git show 2485a97:docs/product.md`) when resuming. Read source and reference
  chapters only for the work at hand. Do not re-audit all prior research before
  each change.
- The new process and design replace the old proof-driven execution plan.
  `docs/specs/` and `docs/evidence/` describe the previous prototype unless a new
  brief explicitly adopts a particular requirement or fixture. Historical
  “next steps,” delegation rules and revision protocols are not current orders.
- The FreeCAD compendium contains source evidence and earlier Freac inferences.
  Neither another application's complexity nor an earlier agent's inference
  establishes a requirement for this application.

The founder should not have to decide module boundaries, repair build commands,
or discover that an advertised button was never tested. The agent makes routine
engineering decisions and brings back actual product choices and usable results.
