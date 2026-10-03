#include "boundary-move.h"
#include "boundary-validation.h"
#include "offset-repair.h"
#include <BRepAdaptor_Curve.hxx>
#include <BRepBuilderAPI_MakeFace.hxx>
#include <Geom_BezierCurve.hxx>
#include <Geom_BezierSurface.hxx>
#include <Geom_BSplineCurve.hxx>
#include <GeomFill_BezierCurves.hxx>
#include <TColgp_Array1OfPnt.hxx>
#include <array>

namespace boundary_move {
TopoDS_Face bezierQuad(const TopoDS_Face& source, const std::vector<TopoDS_Edge>& edges) {
    if (edges.size() != 4) return {};
    std::array<Handle(Geom_BezierCurve),4> curves;
    for (int i = 0; i < 4; ++i) {
        BRepAdaptor_Curve curve(edges[i]);
        if (curve.GetType() == GeomAbs_BezierCurve) {
            curves[i] = Handle(Geom_BezierCurve)::DownCast(curve.Bezier()->Copy());
            if (curves[i]->IsRational()) return {};
            curves[i]->Segment(curve.FirstParameter(),curve.LastParameter());
        } else if (curve.GetType() == GeomAbs_BSplineCurve) {
            const auto spline = curve.BSpline();
            if (spline->IsRational() || spline->NbPoles() != spline->Degree()+1 ||
                spline->NbKnots() != 2 || spline->Multiplicity(1) != spline->Degree()+1 ||
                spline->Multiplicity(2) != spline->Degree()+1) return {};
            TColgp_Array1OfPnt poles(1,spline->NbPoles());
            spline->Poles(poles);
            curves[i] = new Geom_BezierCurve(poles);
            const double first = spline->FirstParameter(), range = spline->LastParameter()-first;
            curves[i]->Segment((curve.FirstParameter()-first)/range,(curve.LastParameter()-first)/range);
        } else return {};
        if (edges[i].Orientation() == TopAbs_REVERSED) curves[i]->Reverse();
    }
    // Algebraic four-boundary interpolation retains the exact cubic rims.
    // General plate approximation can miss these rims despite a small sample error.
    GeomFill_BezierCurves filling(curves[0],curves[1],curves[2],curves[3],GeomFill_CoonsStyle);
    BRepBuilderAPI_MakeFace face(filling.Surface(),1e-7);
    require(face.IsDone(),"Cannot reconnect the cubic boundary patch");
    offset_geometry::tightenGeneratedBoundaries(face.Face(),source,false);
    return face.Face();
}
}
