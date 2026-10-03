#pragma once
#include <BRepAdaptor_Surface.hxx>
#include <array>
#include <vector>

namespace erosion {
// Convex hull boxes enclose the complete surface, including any trimmed face.
class BezierBounds {
    std::vector<std::array<double,6>> boxes;
public:
    explicit BezierBounds(const BRepAdaptor_Surface&);
    double lower(const gp_Pnt&) const;
    bool crosses(const std::array<gp_Pnt,8>&) const;
};
}
