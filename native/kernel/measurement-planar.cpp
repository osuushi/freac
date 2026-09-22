#include "measurement.h"
#include <BRepAdaptor_Curve.hxx>
#include <BRepAdaptor_Surface.hxx>
#include <BRep_Tool.hxx>
#include <TopExp_Explorer.hxx>
#include <TopoDS.hxx>
#include <gp_Pln.hxx>
#include <algorithm>
#include <cmath>

namespace {
using Segment = std::pair<gp_Pnt, gp_Pnt>;
bool segments(const TopoDS_Shape& shape, std::vector<Segment>& result) {
    if (shape.ShapeType() == TopAbs_FACE && BRepAdaptor_Surface(TopoDS::Face(shape)).GetType() != GeomAbs_Plane) return false;
    for (TopExp_Explorer e(shape, TopAbs_EDGE); e.More(); e.Next()) {
        const auto edge = TopoDS::Edge(e.Current());
        if (BRep_Tool::Degenerated(edge)) continue;
        BRepAdaptor_Curve curve(edge);
        if (curve.GetType() != GeomAbs_Line) return false;
        result.emplace_back(curve.Value(curve.FirstParameter()), curve.Value(curve.LastParameter()));
    }
    return !result.empty();
}
gp_Pnt lerp(const Segment& edge, double t) { return edge.first.Translated(gp_Vec(edge.first, edge.second) * t); }
gp_Pnt project(const gp_Pnt& p, const gp_Pln& plane) {
    const gp_Vec normal(plane.Axis().Direction());
    return p.Translated(normal * -gp_Vec(plane.Location(), p).Dot(normal));
}
void crossing(const Segment& source, const Segment& target, const gp_Pln& plane, std::vector<gp_Pnt>& points) {
    const auto a = project(source.first, plane), b = project(source.second, plane);
    const gp_Vec u(a, b), v(target.first, target.second), w(a, target.first), n(plane.Axis().Direction());
    const double denominator = u.Crossed(v).Dot(n);
    if (std::abs(denominator) < 1e-12) return;
    const double s = w.Crossed(v).Dot(n) / denominator, t = w.Crossed(u).Dot(n) / denominator;
    if (s >= -1e-10 && s <= 1 + 1e-10 && t >= -1e-10 && t <= 1 + 1e-10)
        points.push_back(lerp(source, std::clamp(s, 0.0, 1.0)));
}
}
// All vertices of the projected overlap, including hole boundaries. A linear
// plane separation reaches its extrema here (or at an interior zero crossing).
bool planarGapSamples(const TopoDS_Shape& source, const TopoDS_Shape& target, std::vector<gp_Pnt>& points) {
    std::vector<Segment> from, to;
    if (!segments(source, from) || !segments(target, to)) return false;
    if (target.ShapeType() == TopAbs_FACE) {
        const auto plane = BRepAdaptor_Surface(TopoDS::Face(target)).Plane();
        for (const auto& edge : from) {
            points.push_back(edge.first); points.push_back(edge.second);
            for (const auto& boundary : to) crossing(edge, boundary, plane, points);
            const gp_Vec n(plane.Axis().Direction());
            const double a = gp_Vec(plane.Location(), edge.first).Dot(n), b = gp_Vec(plane.Location(), edge.second).Dot(n);
            if (a * b < 0) points.push_back(lerp(edge, a / (a - b)));
        }
        return true;
    }
    if (source.ShapeType() != TopAbs_EDGE || from.size() != 1 || to.size() != 1) return false;
    const auto& edge = from[0]; const auto& reference = to[0];
    const gp_Vec v(reference.first, reference.second);
    const double length2 = v.SquareMagnitude();
    if (length2 < 1e-16) return false;
    const double a = gp_Vec(reference.first, edge.first).Dot(v) / length2;
    const double b = gp_Vec(reference.first, edge.second).Dot(v) / length2;
    points.push_back(edge.first); points.push_back(edge.second);
    if (std::abs(b-a) > 1e-12) for (double boundary : {0.0, 1.0}) {
        const double t = (boundary-a)/(b-a);
        if (t >= 0 && t <= 1) points.push_back(lerp(edge, t));
    }
    return true;
}
