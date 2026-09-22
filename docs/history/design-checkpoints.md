# Original design checkpoints

Historical sequence, not the current stage. See roadmap (historical; `git show 4241f50:docs/roadmap.md`).

## Delivery and review checkpoints

The roadmap (historical; `git show 4241f50:docs/roadmap.md`) owns sequencing, review points and acceptance routes.
S0 establishes setup and the shared world; continue directly to S1 for the first
usable sketch review. S1–S5 complete sketch v1 before any solid-tool implementation.

S1 uses the curve/group model above. Simple rectangle edits preserve intrinsic
shape relationships analytically; user-added coupled constraints arrive with the
solver. Do not maintain a second set of canonical rectangle dimensions. Every
creation tool arrives with its selection and subsequent editing behavior.

The roadmap separates functional review from platform evidence. Headless WebKit
is not physical iPad acceptance, and platform buildability must be exercised on
the target. These checks must not turn into another infrastructure milestone.
