#pragma once
#include <TopoDS_Wire.hxx>
#include <vector>
std::vector<TopoDS_Wire> compatibleLoftWires(const std::vector<TopoDS_Wire>&, const std::vector<int>&);
