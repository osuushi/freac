# Agent affordance experiments

These are ad hoc experiments, not CI tests or a permanent benchmark. Use dated
records to retain what was tested and learned; revise cases as product priorities change.

The initial `scripts/evals/agent-affordances.mjs` experiment uses an owned hidden Electron drawing containing
two independent cylinders (radii 2 and 8 mm, height 10 mm). It compares old versus
new launch instructions while holding the current API and workspace operating guide
constant. This isolates launch wording; it is **not** a full old/new product comparison.
Each prompt starts a fresh ephemeral Codex session. Prompts are “Select all the
cylindrical faces” and “Select all cylindrical faces with radius below 5 mm.”
The harness checks actual selected IDs and records elapsed time, commands and final
messages. Raw JSONL stays in the ignored `.cache/agent-eval` directory. No assertions
on model latency or behavior enter CI. No result has been obtained yet.

Planned invocation, after approval for authenticated model execution:

```sh
source /Users/adacohen/.nvm/nvm.sh && nvm use
npm run build
FREAC_EVAL_MODEL=gpt-6-luna FREAC_EVAL_EFFORT=low node scripts/evals/agent-affordances.mjs
```

`FREAC_CODEX_EXECUTABLE` can select the CLI; `FREAC_EVAL_OUTPUT` can select the raw
output directory. The driver uses Codex's existing authentication, ignores user
configuration, and gives the evaluated agent workspace-write access to the temporary
CAD workspace. It sends the task, generated instructions and tool outputs to the model
service. Review execution permissions and data scope before running. It does not
copy credentials into the drawing. Further experiments should include resumed
sessions, visible-only scope, mixed selection and follow-up edits when those questions
matter; this small comparison cannot establish general modeling quality.
