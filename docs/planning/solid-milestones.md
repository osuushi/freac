# Solid and agent milestone planning

Original planning/reference material; old next-step language is not authorization.
This is historical planning, not a current work queue. Cubic editing supersedes
the original spline exclusion.

## After sketch acceptance

The 2026-09-15 founder review authorizes planning B1 now, while sketch work remains.
The [solid-loop proposal](../sketch-solid-loop.md) defines that planning increment;
implementation sequencing awaits its review. The original full sketch-v1 gate
below is not a reason to postpone the requested design work.

The next committed priority is **extrusion**. The following order after extrusion
is proposed and can be adjusted at its review; these are distinct tool releases,
not permission to implement the entire remaining CAD system.

| Stage | Design and acceptance focus |
| --- | --- |
| **B1 — Extrude** | Review input selection, drag/quantity editing, U/S/I/N, overlap defaults, completion/cancellation and participant bodies first. Implement multiple selected profiles/faces and multiple output bodies. A cut through the middle must preview two bodies, remain adjustable across release, then accept once on exit. Cancel restores the original; Undo reverses the accepted operation. Planar result faces, including faces after a cut, support sketching. |
| **B2 — Direct body editing** | Select accepted faces and move/offset them with local handles and useful measurements. Design single/multiple-face behavior and failure cases. This operates on accepted bodies and does not replace an active extrusion after its first drag. |
| **B3 — Revolve** | Review profile selection, geometric axis selection, angle/direction, Boolean modes, temporary result and accept/cancel behavior. Test open/full rotations and the body's planar faces as sketch context where applicable. |
| **B4 — Subsequent modeling tools; Loft deferred** | Founder deferred Loft on 2026-09-16. Choose the next tool from frequent modeling tasks and review its interaction before implementation. Revisit ordered-section Loft only when requested. |

For B1, changing the length, Boolean mode or profile selection recomputes the
candidate from the original inputs. It does not cut the previous preview again.
Release and quantity confirmation update that candidate. Completing/exiting the
tool accepts a valid result as one Undo step; explicit cancel restores the
original. App defocus is not acceptance. Local controls and camera navigation
keep the operation unobtrusive. Exact key/click mappings for accept, exit, cancel
and field Enter are decided in the B1 design before coding, not inferred from
the older non-modal extrusion specification.

The first solid-tool design also covers captured profile membership and intended
source edits. Adding unrelated drawing must not change an old solid; editing
its original dimensions must behave according to the product contract. Handle
these concrete dependencies there, not by building a history framework in S0.

### Embedded agent and distribution

After sketch v1 and a useful extrusion workflow, review the timing of a bounded
agent checkpoint alongside the next solid tool. The agent remains a core feature:
access frontend/backend source, inspect the current model, make an edit through
the same single-user edit path, and hand back to manual editing with shared Undo.
Implement that checkpoint on its own; it does not need concurrent document edits,
revision protocols or a remote session platform. Remote hosting and packaged
distribution get explicit later priorities. Basic buildability is already part
of sketch delivery and must not be postponed to that distribution work.
