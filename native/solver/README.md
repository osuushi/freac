# Native sketch calculator

A stateless calculation per input, over an owned child process's stdin/stdout.
It has no document, history or IDs. The TypeScript backend translates document
references into temporary parameter indexes and checks the returned residuals.

PlaneGCS comes from FreeCAD commit `78e4038a564e4c8bfebb40119b41d67531232223`.
`sources.json` pins every original input's SHA-256. `scripts/setup-native.mjs`
downloads and verifies those files, retains originals, and adapts only host
includes/export declarations. `p0_base_compat.h` is Freac's logging/unreachable
shim from the previous proof. No upstream solver equations are modified.

Upstream source headers carry LGPL-2.1-or-later notices, retained in the build
inputs. Source: https://github.com/FreeCAD/FreeCAD/tree/78e4038a564e4c8bfebb40119b41d67531232223/src/Mod/Sketcher/App/planegcs
The additional Boost graph wrapper retains its upstream copyright/license header.
Eigen and Boost headers are build prerequisites and retain their own licenses.
Do not distribute binaries without the corresponding license notices and source/
rebuild materials; this checkout provides the manifest and adaptation, not an
installer or final application licensing package.
