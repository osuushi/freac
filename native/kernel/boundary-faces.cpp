#include "boundary-move.h"
#include "boundary-validation.h"
#include "scale-transform.h"
#include <BRepBuilderAPI_Copy.hxx>
#include <BRepBuilderAPI_MakeFace.hxx>
#include <BRepBuilderAPI_MakeWire.hxx>
#include <BRepBuilderAPI_NurbsConvert.hxx>
#include <BRepBuilderAPI_Transform.hxx>
#include <BRepFill.hxx>
#include <BRepOffsetAPI_MakeFilling.hxx>
#include <BRepTools.hxx>
#include <BRepTools_WireExplorer.hxx>
#include <BRep_Tool.hxx>
#include <BRepAdaptor_Curve.hxx>
#include <BRepAdaptor_Surface.hxx>
#include <gp_Pln.hxx>
#include <TopoDS_Wire.hxx>

namespace boundary_move {
namespace {
std::vector<TopoDS_Edge> boundary(const TopoDS_Wire& wire, const TopoDS_Face& face, const Edit& edit) {
    std::vector<TopoDS_Edge> result;
    for (BRepTools_WireExplorer it(wire, face); it.More(); it.Next())
        result.push_back(edit.edge(it.Current()));
    return result;
}
TopoDS_Wire wire(const std::vector<TopoDS_Edge>& edges) {
    BRepBuilderAPI_MakeWire builder;
    for (const auto& edge : edges) builder.Add(edge);
    require(builder.IsDone(), "Moved boundary does not form a connected wire");
    return builder.Wire();
}
TopoDS_Face band(const TopoDS_Face& face, const Edit& edit) {
    std::vector<TopoDS_Edge> boundaries;
    TopTools_IndexedMapOfShape edges;
    TopExp::MapShapes(face, TopAbs_EDGE, edges);
    bool seam = false;
    for (int i = 1; i <= edges.Extent(); ++i) {
        auto edge = TopoDS::Edge(edges(i));
        if (BRep_Tool::IsClosed(edge, face)) { seam = true; continue; }
        if (!BRep_Tool::IsClosed(edge)) return {};
        edge.Orientation(TopAbs_FORWARD);
        boundaries.push_back(edit.edge(edge));
    }
    if (!seam || boundaries.size() != 2) return {};
    if (edit.transform.Form() == gp_Other) {
        // Match GTransform's rational conic parameterization on both rims.
        // Mixing analytic and rational parameters twists the intermediate sections.
        for (auto& edge : boundaries)
            edge = TopoDS::Edge(BRepBuilderAPI_NurbsConvert(edge, true).Shape());
    }
    // The original parameter directions define correspondence, not nearest points
    // after movement. This also works when either closed boundary is no longer circular.
    return BRepFill::Face(boundaries[0], boundaries[1]);
}
bool onPlane(const gp_Pln& plane, const std::vector<TopoDS_Edge>& edges) {
    for (const auto& edge : edges) {
        BRepAdaptor_Curve curve(edge);
        for (int i = 0; i <= 32; ++i) {
            const double t = curve.FirstParameter() + (curve.LastParameter() - curve.FirstParameter()) * i / 32;
            if (plane.Distance(curve.Value(t)) > 1e-7) return false;
        }
    }
    return true;
}
}
TopoDS_Face rebuildFace(const TopoDS_Face& source, const Edit& edit) {
    if (edit.rigidFaces.Contains(source))
        return TopoDS::Face(affineShape(source, edit.transform));
    if (!edit.affected(source)) return TopoDS::Face(BRepBuilderAPI_Copy(source).Shape());
    auto face = source;
    face.Orientation(TopAbs_FORWARD);
    const auto cylindrical = cylinderFace(face, edit);
    if (!cylindrical.IsNull()) return cylindrical;
    const auto ruled = band(face, edit);
    if (!ruled.IsNull()) return ruled;
    const auto outer = BRepTools::OuterWire(face);
    const auto edges = boundary(outer, face, edit);
    std::vector<TopoDS_Wire> holes;
    std::vector<TopoDS_Edge> allEdges = edges;
    for (TopExp_Explorer it(face, TopAbs_WIRE); it.More(); it.Next()) {
        if (it.Current().IsSame(outer)) continue;
        const auto inner = boundary(TopoDS::Wire(it.Current()), face, edit);
        holes.push_back(wire(inner));
        allEdges.insert(allEdges.end(), inner.begin(), inner.end());
    }
    const auto outline = wire(edges);
    const BRepAdaptor_Surface original(face);
    BRepBuilderAPI_MakeFace planar;
    if (original.GetType() == GeomAbs_Plane && onPlane(original.Plane(), allEdges))
        planar = BRepBuilderAPI_MakeFace(original.Plane(), outline, true);
    else
        planar = BRepBuilderAPI_MakeFace(outline, true);
    if (planar.IsDone()) {
        const auto support = BRepAdaptor_Surface(planar.Face()).Plane();
        if (onPlane(support, allEdges)) {
            for (const auto& hole : holes) planar.Add(hole);
            require(planar.IsDone(), "Cannot trim the reconnected planar face");
            return planar.Face();
        }
    }
    require(holes.empty(), "Cannot yet reconnect a face with multiple boundary loops");
    BRepOffsetAPI_MakeFilling filling(3, 20, 3, false, 1e-8, 1e-7, 0.01, 0.1, 8, 16);
    for (const auto& edge : edges) filling.Add(edge, GeomAbs_C0);
    filling.Build();
    require(filling.IsDone() && filling.G0Error() <= tolerance,
            "Cannot fit a surface within the boundary tolerance");
    return TopoDS::Face(filling.Shape());
}
}
