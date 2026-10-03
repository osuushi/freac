#include "erosion-bezier-bounds.h"
#include "geometry-policy.h"
#include <Geom_BezierSurface.hxx>
#include <algorithm>
#include <cmath>
#include <limits>

erosion::BezierBounds::BezierBounds(const BRepAdaptor_Surface& surface) {
    if (surface.GetType() != GeomAbs_BezierSurface) return;
    const auto original = surface.Bezier();
    if (original->IsURational() || original->IsVRational()) return;
    constexpr int divisions = 8;
    for (int i = 0; i < divisions; ++i) for (int j = 0; j < divisions; ++j) {
        auto patch = Handle(Geom_BezierSurface)::DownCast(original->Copy());
        patch->Segment(double(i)/divisions, double(i+1)/divisions,
                       double(j)/divisions, double(j+1)/divisions);
        std::array<double,6> box;
        for (int axis = 0; axis < 3; ++axis) {
            box[axis] = std::numeric_limits<double>::infinity();
            box[axis+3] = -box[axis];
        }
        for (int u = 1; u <= patch->NbUPoles(); ++u) for (int v = 1; v <= patch->NbVPoles(); ++v)
            for (int axis = 0; axis < 3; ++axis) {
                const double value = patch->Pole(u,v).Coord(axis+1);
                box[axis] = std::min(box[axis],value);
                box[axis+3] = std::max(box[axis+3],value);
            }
        for (int axis = 0; axis < 3; ++axis) {
            box[axis] -= geometry_policy::boundaryDistanceMm;
            box[axis+3] += geometry_policy::boundaryDistanceMm;
        }
        boxes.push_back(box);
    }
}
double erosion::BezierBounds::lower(const gp_Pnt& point) const {
    if (boxes.empty()) return 0;
    double best = std::numeric_limits<double>::infinity();
    for (const auto& box : boxes) {
        double squared = 0;
        for (int axis = 0; axis < 3; ++axis) {
            const double delta = std::max({box[axis]-point.Coord(axis+1),point.Coord(axis+1)-box[axis+3],0.0});
            squared += delta*delta;
        }
        best = std::min(best,squared);
    }
    return std::sqrt(best);
}
bool erosion::BezierBounds::crosses(const std::array<gp_Pnt,8>& points) const {
    if (boxes.empty()) return true;
    return std::any_of(boxes.begin(),boxes.end(),[&](const auto& box) {
        for (int axis = 0; axis < 3; ++axis)
            if (points[7].Coord(axis+1) < box[axis] || points[0].Coord(axis+1) > box[axis+3]) return false;
        return true;
    });
}
