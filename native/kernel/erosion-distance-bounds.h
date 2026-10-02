#pragma once
#include <TopoDS_Shape.hxx>
#include <gp_Pnt.hxx>
#include <memory>
#include <array>

namespace erosion {
// Exact distance on polyhedra; conservative lower bounds on curved supports.
// The tessellation used for planar polygon interiors is calculation data only.
class BoundaryDistance {
    struct Impl;
    std::unique_ptr<Impl> impl;
public:
    explicit BoundaryDistance(const TopoDS_Shape&);
    ~BoundaryDistance();
    bool exact() const;
    double lower(const gp_Pnt&) const;
    double upper(const gp_Pnt&, double limit = -1) const;
    double upper(const std::array<gp_Pnt, 8>&) const;
    bool crosses(const std::array<gp_Pnt, 8>&) const;
};
}
