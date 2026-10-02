#pragma once
#include "kernel.h"

namespace erosion {
TopoDS_Shape boundary(const TopoDS_Shape& shape);
// Independently check that every point deeper than depth survives in the candidate.
// Unresolved distance bounds reject; a failed construction is never an empty result.
void checkCoverage(const TopoDS_Shape& source, const TopoDS_Shape& candidate, double depth);
void validateCavity(const TopoDS_Shape& source, const TopoDS_Shape& candidate,
                    double thickness, double allowance);
TopoDS_Shape simplify(const TopoDS_Shape& source, double allowance);
}

std::vector<Result> erodeBodies(const Tree&, const std::vector<Operand>&,
                               std::vector<std::string>&);
