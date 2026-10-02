#include "erosion.h"
#include "geometry-policy.h"
#include <BRepAdaptor_Surface.hxx>
#include <BRep_Tool.hxx>
#include <TopExp_Explorer.hxx>
#include <TopoDS.hxx>
#include <TopoDS_Edge.hxx>
#include <gp_Sphere.hxx>
#include <algorithm>
#include <optional>

namespace {
struct Interval {
    gp_Pnt center;
    double inner = 0, outer = 0;
};
std::optional<Interval> sphericalSolid(const TopoDS_Shape& solid) {
    Interval result;
    bool centered = false;
    for (TopExp_Explorer f(solid, TopAbs_FACE); f.More(); f.Next()) {
        const auto face = TopoDS::Face(f.Current());
        BRepAdaptor_Surface surface(face);
        if (surface.GetType() != GeomAbs_Sphere) return {};
        for (TopExp_Explorer e(face, TopAbs_EDGE); e.More(); e.Next()) {
            const auto edge = TopoDS::Edge(e.Current());
            if (!BRep_Tool::Degenerated(edge) && !BRep_Tool::IsClosed(edge, face)) return {};
        }
        const auto sphere = surface.Sphere();
        if (centered && result.center.Distance(sphere.Location()) > 1e-12) return {};
        centered = true;
        result.center = sphere.Location();
        if (face.Orientation() != TopAbs_FORWARD && face.Orientation() != TopAbs_REVERSED) return {};
        const bool outward = (face.Orientation() == TopAbs_FORWARD) == sphere.Direct();
        if (outward && result.outer == 0) result.outer = sphere.Radius();
        else if (!outward && result.inner == 0) result.inner = sphere.Radius();
        else return {};
    }
    if (!centered || result.outer <= result.inner) return {};
    return result;
}
}

std::optional<bool> erosion::sphericalCoverage(const TopoDS_Shape& source,
                                              const TopoDS_Shape& candidate, double depth) {
    TopExp_Explorer sources(source, TopAbs_SOLID);
    if (!sources.More()) return {};
    const auto input = sphericalSolid(sources.Current());
    sources.Next();
    if (!input || sources.More()) return {};
    // Whole concentric spherical shells are radial intervals. Their exact
    // depth set is another interval, including a zero-volume collapsed shell.
    // This avoids millions of Cartesian cells around a thin curved wall.
    const double low = input->inner > 0 ? input->inner+depth : 0;
    const double high = input->outer-depth;
    constexpr double tolerance = geometry_policy::boundaryDistanceMm/4;
    if (high <= low+tolerance) return true;
    std::vector<std::pair<double, double>> intervals;
    for (TopExp_Explorer s(candidate, TopAbs_SOLID); s.More(); s.Next()) {
        const auto interval = sphericalSolid(s.Current());
        if (!interval || interval->center.Distance(input->center) > 1e-12) return {};
        intervals.emplace_back(interval->inner, interval->outer);
    }
    std::sort(intervals.begin(), intervals.end());
    double covered = low;
    for (const auto& [first, last] : intervals) {
        if (first > covered+tolerance) break;
        covered = std::max(covered, last);
        if (covered >= high-tolerance) return true;
    }
    return false;
}
