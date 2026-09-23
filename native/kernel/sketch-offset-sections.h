#pragma once
#include "kernel.h"
#include <TopoDS_Wire.hxx>

TopoDS_Shape closedOffsetSections(const TopoDS_Shape&, const TopoDS_Wire&, double);
