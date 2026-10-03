#include "erosion-distance-bounds.h"
#include <BRepAdaptor_Surface.hxx>
#include <BRepBuilderAPI_MakeFace.hxx>
#include <BRepBuilderAPI_MakeVertex.hxx>
#include <BRepBuilderAPI_Transform.hxx>
#include <BRepExtrema_DistShapeShape.hxx>
#include <Geom_BezierSurface.hxx>
#include <TColgp_Array2OfPnt.hxx>
#include <TopoDS.hxx>
#include <stdexcept>

void bezierDistanceBounds() {
    TColgp_Array2OfPnt poles(1,4,1,4);
    for (int u = 1; u <= 4; ++u) for (int v = 1; v <= 4; ++v)
        poles.SetValue(u,v,gp_Pnt(u*2,v*3,2*std::sin(u*1.2)*std::cos(v*.8)));
    Handle(Geom_BezierSurface) surface = new Geom_BezierSurface(poles);
    const auto source = BRepBuilderAPI_MakeFace(surface,.13,.87,.21,.93,1e-7).Face();
    gp_Trsf rotation; rotation.SetRotation(gp_Ax1(gp_Pnt(),gp_Dir(1,2,3)),.7);
    rotation.SetTranslationPart(gp_Vec(25,-18,31));
    for (bool copy : {false,true}) {
        const auto face = TopoDS::Face(BRepBuilderAPI_Transform(source,rotation,copy).Shape());
        erosion::BoundaryDistance bounds(face);
        BRepAdaptor_Surface actual(face);
        for (int i = 0; i < 30; ++i) {
            const double u = .13+.74*((i*7)%29)/29, v = .21+.72*((i*11)%29)/29;
            const auto onSurface = actual.Value(u,v);
            const gp_Pnt point = onSurface.Translated(gp_Vec(.4,-.9,(i-15)*.21));
            BRepExtrema_DistShapeShape distance(BRepBuilderAPI_MakeVertex(point).Shape(),face);
            if (!distance.IsDone() || bounds.lower(point) > distance.Value()+1e-6 ||
                bounds.upper(point) < distance.Value()-1e-6)
                throw std::runtime_error("Transformed trimmed Bezier distance bounds are not conservative");
            std::array<gp_Pnt,8> corners;
            for (int j = 0; j < 8; ++j) corners[j] = onSurface.Translated(gp_Vec(
                j&1 ? .001 : -.001,j&2 ? .001 : -.001,j&4 ? .001 : -.001));
            if (!bounds.crosses(corners))
                throw std::runtime_error("Bezier bounds missed an actual surface crossing");
        }
    }
}
