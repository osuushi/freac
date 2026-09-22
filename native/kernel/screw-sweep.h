#pragma once
#include "kernel.h"
#include <gp_Ax1.hxx>

std::vector<TopoDS_Face> axialSections(const TopoDS_Face&, const gp_Ax1&);
TopoDS_Shape screwSweep(const TopoDS_Face&, const gp_Ax1&, double angle, double height);
void validateSweptSolids(const TopoDS_Shape&);
