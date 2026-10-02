#pragma once
#include "kernel.h"
#include "geometry-policy.h"
#include <TopTools_ListOfShape.hxx>

namespace shell_tool {
Operand canonical(const Operand& source, const char* context = "Shell");
using geometry_policy::boundaryDistanceMm;
TopoDS_Shape oneSolid(const TopoDS_Shape& shape);
TopoDS_Shape subtract(const TopoDS_Shape& a, const TopoDS_Shape& b);
void validateWall(const TopoDS_Shape& source, const TopoDS_Shape& wall,
                  const TopoDS_Shape& offsetSkin, const TopoDS_Shape& retainedSkin,
                  const TopTools_ListOfShape& openings, double thickness);
}
