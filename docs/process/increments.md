# Briefs, implementation and scope

Read when this procedure is needed. [Process overview](../development-process.md).

## Resume without restarting the planning cycle

The current user request determines the active work. The design owns lasting
model/interaction decisions; this document owns the working method. Keep immediate
continuity in the local brief, without a central delivery or review ledger.

On resumption, inspect Git changes and reconcile the active local brief with the
current user request and actual code. Preserve user changes. If the brief is absent or
stale,
reconstruct the next bounded increment from those sources. An old ticket or
conversation summary does not reactivate an abandoned proof or superseded rule.
Do not redo the whole audit or ask the founder to approve an already settled step.

Before pausing or handing off, leave the brief with the working behavior, latest
relevant check/commit, known gaps, any owned processes and the next concrete action.
Distinguish implemented, runtime-verified and founder-reviewed states. A passing
test does not complete a product review gate. This is continuity information in
the existing brief, not a new report per commit.

## A short brief before each implementation increment

Keep one active brief, normally 10–20 lines in the local, untracked `TICKETS.md`.
Do not create a new specification, evidence report and handoff document for every
helper. Update the governing documents only when a lasting decision changes.

Each brief contains:

1. **User outcome:** the exact action that becomes possible.
2. **Interaction:** entry/selection, pointer and keyboard behavior, local controls,
   anchoring, completion, cancellation and failure behavior.
3. **Model edit:** which existing data changes, what remains related, and the
   single Undo step. Name owning modules and the interfaces that change.
4. **Acceptance:** a short ordinary-input route, numerical expectations where
   relevant, and the adjacent interactions likely to regress.
5. **Scope and estimate:** included work, excluded work, expected time to the
   first running result, and the next product checkpoint.

Use the design's defaults. Do not ask for approval of every brief. A new solid
tool or a material change to agreed interaction semantics needs a concrete design
review before implementation. Internal choices with a clear answer do not.

## The working loop

1. Reproduce the current behavior through the actual interface when it exists.
   Inspect only the relevant code and current working-tree changes.
2. Write the brief. Check that the outcome fits the existing model and ownership.
3. Implement the smallest complete path from input to accepted geometry. Connect
   it to the real editor immediately; do not build several backend layers before
   discovering whether the interaction is useful.
4. Exercise the path using ordinary input and the real geometry/solver path.
   Add focused mathematical or regression tests where they catch meaningful
   failures that are difficult to see or easy to repeat.
5. Review the diff for behavior, ownership, unnecessary machinery and regressions.
   Run the relevant checks, inspect the result, clean up owned test processes,
   and commit the coherent change.
6. Continue to the agreed product checkpoint. Pause there with a runnable result
   and a short review route. An internal helper finishing is not a review point.

A newly reported defect in the active workflow outranks adding another feature.
Do not accumulate feature work on top of broken selection, editing, Clear or Undo.

## Control scope and cost during the work

Aim for a runnable result within the first hour of an interaction increment and
a reviewed implementation increment within roughly two hours. These are planning
limits, not estimates for the whole sketch editor or reasons to omit behavior.
Split larger outcomes into visible increments before starting.

- If 30 minutes pass without progress toward the running interaction, inspect
  whether the task has turned into infrastructure work. State the obstacle and
  shrink the approach; do not quietly widen the architecture.
- A component experiment gets one question, one small fixture and a time limit,
  normally at most one hour. It ends in use/reject/unknown, with exact evidence.
  “Unknown” is not permission to build a general integration framework.
- After two failed attempts at the same obstacle, stop repeating the approach.
  Reproduce the mismatch, examine the assumption and choose the smallest fix.
  Ask the founder only if a real product choice or unavailable input blocks it.
- Before exceeding the brief's estimate, report what is working, the actual
  blocker and the revised scope. Continue routine fixes autonomously; obtain
  product input if completing the brief would change the agreed behavior.
- Do not run unrelated full suites after every edit or repeat passing checks
  without a new reason. Do not delegate or switch models to conceal scope growth.

Report elapsed effort and scope honestly. Do not claim token or cost savings
without measurements. A time limit triggers reassessment, never a false “done.”
