#include "offset-repair.h"
#include "offset-geometry.h"
#include <TopoDS_Edge.hxx>
#include <TopoDS_Vertex.hxx>
#include <BRepLib_CheckCurveOnSurface.hxx>
#include <BRep_Tool.hxx>
#include <BRep_Builder.hxx>
#include <Geom_Curve.hxx>
#include <ShapeFix_ShapeTolerance.hxx>
#include <TopExp.hxx>
#include <TopExp_Explorer.hxx>
#include <TopTools_IndexedMapOfShape.hxx>
#include <TopoDS.hxx>
#include <algorithm>
#include <cmath>
#include <stdexcept>
#include <map>

namespace offset_geometry {
namespace {
void fitVertex(const TopoDS_Vertex& vertex, const std::vector<gp_Pnt>& points, bool retained) {
    const auto original = BRep_Tool::Pnt(vertex);
    if (std::all_of(points.begin(), points.end(), [&](const auto& p) {
        return p.Distance(original) <= tolerance;
    })) return;
    gp_XYZ sum(0, 0, 0);
    for (const auto& p : points) sum += p.XYZ();
    const gp_Pnt fitted(sum / static_cast<double>(points.size()));
    if (retained || original.Distance(fitted) > shapeTolerance ||
        std::any_of(points.begin(), points.end(), [&](const auto& p) {
            return p.Distance(fitted) > tolerance;
        })) throw std::runtime_error("Shell boundary endpoints cannot meet within the shape adjustment budget");
    BRep_Builder().UpdateVertex(vertex, fitted, tolerance);
}
}
void tightenGeneratedBoundaries(const TopoDS_Shape& shape, const TopoDS_Shape& source) {
    TopTools_IndexedMapOfShape retained, checked;
    TopExp::MapShapes(source, retained);
    for (TopExp_Explorer f(shape, TopAbs_FACE); f.More(); f.Next()) {
        for (TopExp_Explorer e(f.Current(), TopAbs_EDGE); e.More(); e.Next()) {
            const auto edge = TopoDS::Edge(e.Current());
            if (BRep_Tool::Degenerated(edge)) continue;
            BRepLib_CheckCurveOnSurface check(edge, TopoDS::Face(f.Current()));
            check.Perform();
            if (!BRep_Tool::SameParameter(edge) || !check.IsDone() ||
                !std::isfinite(check.MaxDistance()) || check.MaxDistance() > tolerance)
                throw std::runtime_error("Shell boundary does not meet its incident surfaces");
        }
    }
    TopTools_IndexedMapOfShape edges, vertices;
    TopExp::MapShapes(shape, TopAbs_EDGE, edges);
    TopExp::MapShapes(shape, TopAbs_VERTEX, vertices);
    std::map<int, std::vector<gp_Pnt>> endpoints;
    for (int i = 1; i <= edges.Extent(); ++i) {
        const auto edge = TopoDS::Edge(edges(i).Oriented(TopAbs_FORWARD));
        double first, last;
        const auto curve = BRep_Tool::Curve(edge, first, last);
        if (curve.IsNull()) continue;
        for (const auto& end : {std::make_pair(TopExp::FirstVertex(edge), first),
                               std::make_pair(TopExp::LastVertex(edge), last)}) {
            if (end.first.IsNull()) continue;
            endpoints[vertices.FindIndex(end.first)].push_back(curve->Value(end.second));
            checked.Add(end.first);
        }
    }
    for (const auto& [index, points] : endpoints)
        fitVertex(TopoDS::Vertex(vertices(index)), points, retained.Contains(vertices(index)));
    // Do not mutate preserved topology, including when it shares geometry with
    // the accepted input. Reduction follows the measurements above, never vice versa.
    for (int i = 1; i <= vertices.Extent(); ++i) {
        const auto vertex = TopoDS::Vertex(vertices(i));
        if (BRep_Tool::Tolerance(vertex) <= 2e-6) continue;
        if (retained.Contains(vertex) || !checked.Contains(vertex))
            throw std::runtime_error("Shell could not establish vertex precision");
        ShapeFix_ShapeTolerance().SetTolerance(vertex, 2e-6, TopAbs_VERTEX);
    }
    for (int i = 1; i <= edges.Extent(); ++i) {
        const auto edge = TopoDS::Edge(edges(i));
        if (BRep_Tool::Tolerance(edge) <= 2e-6) continue;
        if (retained.Contains(edge) || BRep_Tool::Degenerated(edge))
            throw std::runtime_error("Shell could not establish edge precision");
        ShapeFix_ShapeTolerance().SetTolerance(edge, 2e-6, TopAbs_EDGE);
    }
}
}
