#include "boundary-move.h"
#include "boundary-validation.h"
#include "scale-transform.h"
#include <BRepAdaptor_Curve.hxx>
#include <BRepBuilderAPI_Copy.hxx>
#include <BRepBuilderAPI_MakeEdge.hxx>
#include <BRepBuilderAPI_MakeVertex.hxx>
#include <BRepBuilderAPI_Transform.hxx>
#include <BRepExtrema_DistShapeShape.hxx>
#include <BRep_Tool.hxx>
#include <GeomConvert.hxx>
#include <Geom_BSplineCurve.hxx>
#include <Geom_BezierCurve.hxx>
#include <TColgp_Array1OfPnt.hxx>
#include <Geom_TrimmedCurve.hxx>
#include <GCPnts_AbscissaPoint.hxx>

namespace boundary_move {
namespace {
bool tangentRim(const TopoDS_Edge& line, const TopoDS_Vertex& vertex,
                const gp_Vec& direction, const Edit& edit) {
    for (int i = 1; i <= edit.sourceEdges.Extent(); ++i) {
        const auto edge = TopoDS::Edge(edit.sourceEdges(i));
        if (edge.IsSame(line)) continue;
        if (edit.affected(edge) && !edit.rigidEdges.Contains(edge)) continue;
        BRepAdaptor_Curve curve(edge);
        if (curve.GetType() == GeomAbs_Line) continue;
        TopoDS_Vertex a, b; TopExp::Vertices(edge, a, b);
        if (!vertex.IsSame(a) && !vertex.IsSame(b)) continue;
        gp_Pnt p; gp_Vec tangent;
        curve.D1(vertex.IsSame(a) ? curve.FirstParameter() : curve.LastParameter(), p, tangent);
        if (tangent.SquareMagnitude() > 1e-20 && tangent.IsParallel(direction, 1e-7)) return true;
    }
    return false;
}
TopoDS_Edge connector(const TopoDS_Edge& edge, const TopoDS_Vertex& a, const TopoDS_Vertex& b,
                      const gp_Pnt& p, const gp_Pnt& q, const Edit& edit) {
    BRepAdaptor_Curve curve(edge);
    const bool cubic = (curve.GetType() == GeomAbs_BezierCurve && curve.Bezier()->Degree() == 3) ||
        (curve.GetType() == GeomAbs_BSplineCurve && curve.BSpline()->Degree() == 3 && curve.BSpline()->NbPoles() == 4);
    if (curve.GetType() != GeomAbs_Line && !cubic) return {};
    gp_Pnt point; gp_Vec start, end;
    curve.D1(curve.FirstParameter(), point, start);
    curve.D1(curve.LastParameter(), point, end);
    if (start.SquareMagnitude() < 1e-20 || end.SquareMagnitude() < 1e-20 ||
        !tangentRim(edge, a, start, edit) || !tangentRim(edge, b, end, edit)) return {};
    start.Normalize(); end.Normalize();
    const gp_Vec chord(p, q);
    if (edit.movedVertices.Contains(a)) start = gp_Vec(edit.transform.VectorialPart() * start.XYZ()).Normalized();
    if (edit.movedVertices.Contains(b)) end = gp_Vec(edit.transform.VectorialPart() * end.XYZ()).Normalized();
    if (start.IsParallel(chord, 1e-10) && end.IsParallel(chord, 1e-10))
        return BRepBuilderAPI_MakeEdge(p, q).Edge();
    // Unselected connectors between tangent rims may bend as their ends move.
    // Preserving their tangents avoids forcing a crease into the neighboring face.
    const double length = chord.Magnitude() / 3;
    TColgp_Array1OfPnt poles(1, 4);
    poles(1) = p; poles(2) = p.Translated(start * length);
    poles(3) = q.Translated(end * -length); poles(4) = q;
    return BRepBuilderAPI_MakeEdge(new Geom_BezierCurve(poles)).Edge();
}
TopoDS_Edge rebuild(const TopoDS_Edge& source, const Edit& edit) {
    auto edge = source;
    edge.Orientation(TopAbs_FORWARD);
    if (!edit.affected(edge)) return TopoDS::Edge(BRepBuilderAPI_Copy(edge).Shape());
    TopoDS_Vertex a, b;
    TopExp::Vertices(edge, a, b);
    require(!a.IsNull() && !b.IsNull(), "Cannot reconnect an edge without endpoints");
    if (edit.rigidEdges.Contains(edge)
        || (edit.movedVertices.Contains(a) && edit.movedVertices.Contains(b)))
        return TopoDS::Edge(affineShape(edge, edit.transform));
    const auto p = edit.moved(a), q = edit.moved(b);
    require(p.Distance(q) > boundaryDistanceMm, "Movement collapses a boundary");
    const auto smooth = connector(edge, a, b, p, q, edit);
    if (!smooth.IsNull()) return smooth;
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
    BRepAdaptor_Curve other(b);
    for (int i = 0; i <= 32; ++i) {
        const double t = curve.FirstParameter() + (curve.LastParameter() - curve.FirstParameter()) * i / 32;
        const double s = other.FirstParameter() + (other.LastParameter() - other.FirstParameter()) * i / 32;
        // A corresponding point is a direct distance witness. Extrema can miss
        // the zero-distance solution even for independently copied spline curves.
        if (curve.Value(t).Distance(other.Value(s)) <= boundaryDistanceMm) continue;
        BRepExtrema_DistShapeShape distance(BRepBuilderAPI_MakeVertex(curve.Value(t)).Vertex(), b);
        if (!distance.IsDone() || distance.Value() > boundaryDistanceMm) return false;
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
    BRepAdaptor_Curve x(a), y(b);
    // Default mass-property quadrature loses more than the matching boundaryDistanceMm
    // on rational spline seams. Integrate both lengths to explicit accuracy.
    const auto length = [](const BRepAdaptor_Curve& curve) {
        return GCPnts_AbscissaPoint::Length(curve, curve.FirstParameter(),
                                          curve.LastParameter(), boundaryDistanceMm * 0.1);
    };
    return std::abs(length(x) - length(y)) < boundaryDistanceMm && samplesOn(a, b) && samplesOn(b, a);
}
}
