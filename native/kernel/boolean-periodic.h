#pragma once
#include "kernel.h"
#include <BRepAlgoAPI_BooleanOperation.hxx>

TopoDS_Shape splitFailedCutFaces(const TopoDS_Shape& source,
                                BRepAlgoAPI_BooleanOperation& failed,
                                std::vector<SourceEntity>& origins);
