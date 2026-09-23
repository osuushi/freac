#pragma once
#include "kernel.h"

namespace offset_geometry {
// Keep the surfaces/curves fixed, fit generated shared vertices within 0.001 mm,
// then discard conservative error bounds only after checking tight agreement.
// Source preparation passes false: existing vertex positions must already agree.
void tightenGeneratedBoundaries(const TopoDS_Shape&, const TopoDS_Shape& source,
                                bool allowVertexAdjustment = true);
}
