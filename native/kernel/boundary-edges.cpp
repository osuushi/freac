#include "boundary-move.h"
#include "boundary-validation.h"
#include <BRepAdaptor_Curve.hxx>
#include <BRepBuilderAPI_Copy.hxx>
#include <BRepBuilderAPI_MakeEdge.hxx>
#include <BRepBuilderAPI_MakeVertex.hxx>
#include <BRepBuilderAPI_Transform.hxx>
#include <BRepExtrema_DistShapeShape.hxx>
#include <BRep_Tool.hxx>
#include <GeomConvert.hxx>
#include <Geom_BSplineCurve.hxx>
#include <Geom_TrimmedCurve.hxx>

namespace boundary_move {
namespace {
TopoDS_Edge rebuild(const TopoDS_Edge& source, const Edit& edit) {
    auto edge = source;
    edge.Orientation(TopAbs_FORWARD);
    if (!edit.affected(edge)) return TopoDS::Edge(BRepBuilderAPI_Copy(edge).Shape());
    TopoDS_Vertex a, b;
    TopExp::Vertices(edge, a, b);
    require(!a.IsNull() && !b.IsNull(), "Cannot reconnect an edge without endpoints");
    if (edit.rigidEdges.Contains(edge)
        || (edit.movedVertices.Contains(a) && edit.movedVertices.Contains(b)))
        return TopoDS::Edge(BRepBuilderAPI_Transform(edge, edit.transform, true).Shape());
    const auto p = edit.moved(a), q = edit.moved(b);
    require(p.Distance(q) > tolerance, "Movement collapses a boundary");
    if (BRepAdaptor_Curve(edge).GetType() == GeomAbs_Line)
        return BRepBuilderAPI_MakeEdge(p, q).Edge();
    Standard_Real first, last;
    const auto curve = BRep_Tool::Curve(edge, first, last);
    require(!curve.IsNull(), "Cannot reconnect an edge without a spatial curve");
    auto spline = GeomConvert::CurveToBSplineCurve(new Geom_TrimmedCurve(curve, first, last));
    const gp_Vec start(BRep_Tool::Pnt(a), p), end(BRep_Tool::Pnt(b), q);
    for (int i = 1; i <= spline->NbPoles(); ++i) {
        const double t = static_cast<double>(i - 1) / (spline->NbPoles() - 1);
        spline->SetPole(i, spline->Pole(i).Translated(start * (1 - t) + end * t));
    }
    return BRepBuilderAPI_MakeEdge(spline).Edge();
}
bool samplesOn(const TopoDS_Edge& a, const TopoDS_Edge& b) {
    BRepAdaptor_Curve curve(a);
    for (int i = 0; i <= 32; ++i) {
        const double t = curve.FirstParameter() + (curve.LastParameter() - curve.FirstParameter()) * i / 32;
        BRepExtrema_DistShapeShape distance(BRepBuilderAPI_MakeVertex(curve.Value(t)).Vertex(), b);
        if (!distance.IsDone() || distance.Value() > tolerance) return false;
    }
    return true;
}
}
void buildEdges(Edit& edit) {
    TopExp::MapShapes(edit.body->shape, TopAbs_EDGE, edit.sourceEdges);
    for (int i = 1; i <= edit.sourceEdges.Extent(); ++i)
        edit.edges.push_back(rebuild(TopoDS::Edge(edit.sourceEdges(i)), edit));
}
bool sameBoundary(const TopoDS_Edge& a, const TopoDS_Edge& b) {
    if (a.IsSame(b)) return true;
    GProp_GProps x, y;
    BRepGProp::LinearProperties(a, x);
    BRepGProp::LinearProperties(b, y);
    return std::abs(x.Mass() - y.Mass()) < tolerance && samplesOn(a, b) && samplesOn(b, a);
}
}
