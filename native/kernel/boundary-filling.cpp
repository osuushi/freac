#include "boundary-move.h"
#include "boundary-validation.h"
#include "offset-repair.h"
#include <BRepOffsetAPI_MakeFilling.hxx>
#include <BRepBuilderAPI_MakeFace.hxx>
#include <BRepAdaptor_Surface.hxx>
#include <BRepLib.hxx>
#include <BRepLib_CheckCurveOnSurface.hxx>
#include <BRep_Builder.hxx>
#include <BRep_Tool.hxx>
#include <GeomProjLib.hxx>

namespace boundary_move {
TopoDS_Face fillFace(const TopoDS_Face& face, const std::vector<TopoDS_Edge>& edges,
                    const std::vector<TopoDS_Wire>& holes) {
    const bool perforated = !holes.empty();
    // Inner constraints need sufficient approximation capacity to meet the
    // outer rim and displaced holes, including between constraint samples.
    BRepOffsetAPI_MakeFilling filling(3, perforated ? 40 : 20, 3, false,
        perforated ? 1e-9 : 1e-8, perforated ? 1e-8 : 1e-7, 0.01, 0.1,
        perforated ? 12 : 8, perforated ? 256 : 16);
    if (perforated && BRepAdaptor_Surface(face).GetType() == GeomAbs_Plane)
        filling.LoadInitSurface(face);
    for (const auto& edge : edges) filling.Add(edge, GeomAbs_C0);
    for (const auto& hole : holes)
        for (TopExp_Explorer it(hole, TopAbs_EDGE); it.More(); it.Next())
            filling.Add(TopoDS::Edge(it.Current()), GeomAbs_C0, false);
    filling.Build();
    require(filling.IsDone() && filling.G0Error() <= tolerance,
            "Cannot fit a surface within the boundary tolerance");
    auto result = TopoDS::Face(filling.Shape());
    if (!perforated) {
        offset_geometry::tightenGeneratedBoundaries(result, face, false);
        return result;
    }
    const auto support = BRep_Tool::Surface(result);
    BRepBuilderAPI_MakeFace trimmed(result);
    for (const auto& hole : holes) {
        for (TopExp_Explorer it(hole, TopAbs_EDGE); it.More(); it.Next()) {
            const auto edge = TopoDS::Edge(it.Current());
            double first, last, precision = 1e-7;
            const auto spatial = BRep_Tool::Curve(edge, first, last);
            const auto pcurve = GeomProjLib::Curve2d(spatial, first, last, support, precision);
            require(!pcurve.IsNull() && std::isfinite(precision) && precision <= tolerance,
                    "Cannot reconnect the hole boundary within tolerance");
            BRep_Builder().UpdateEdge(edge, pcurve, result, 1e-7);
        }
        trimmed.Add(hole);
    }
    require(trimmed.IsDone(), "Cannot trim the reconnected surface");
    result = trimmed.Face();
    BRepLib::SameParameter(result, 1e-7, true);
    for (TopExp_Explorer it(result, TopAbs_EDGE); it.More(); it.Next()) {
        const auto edge = TopoDS::Edge(it.Current());
        BRepLib_CheckCurveOnSurface check(edge, result);
        check.Perform();
        require(check.IsDone() && std::isfinite(check.MaxDistance()) &&
                check.MaxDistance() <= tolerance && BRep_Tool::Tolerance(edge) <= tolerance,
                "Reconnected surface does not meet its boundary within tolerance");
    }
    offset_geometry::tightenGeneratedBoundaries(result, face, false);
    return result;
}
}
