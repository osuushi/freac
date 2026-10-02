#include "erosion.h"
#include <BRepAdaptor_Surface.hxx>
#include <BRepBuilderAPI_Transform.hxx>
#include <TopExp_Explorer.hxx>
#include <TopoDS.hxx>
#include <gp_Pln.hxx>
#include <gp_Cylinder.hxx>
#include <gp_Cone.hxx>
#include <gp_Sphere.hxx>
#include <gp_Torus.hxx>
#include <optional>

std::pair<TopoDS_Shape, TopoDS_Shape> erosion::coverageFrame(
    const TopoDS_Shape& source, const TopoDS_Shape& candidate) {
    std::optional<gp_Ax3> axes;
    for (TopExp_Explorer f(source, TopAbs_FACE); f.More(); f.Next()) {
        const BRepAdaptor_Surface surface(TopoDS::Face(f.Current()));
        if (surface.GetType() == GeomAbs_Plane) {
            axes = surface.Plane().Position();
            break;
        }
        if (axes) continue;
        switch (surface.GetType()) {
            case GeomAbs_Cylinder: axes = surface.Cylinder().Position(); break;
            case GeomAbs_Cone: axes = surface.Cone().Position(); break;
            case GeomAbs_Sphere: axes = surface.Sphere().Position(); break;
            case GeomAbs_Torus: axes = surface.Torus().Position(); break;
            default: break;
        }
    }
    if (!axes) return {source, candidate};
    if (!axes->Direct()) axes->YReverse();
    // Adaptive Cartesian cells should follow the solid rather than its world
    // placement. This rigid change of calculation coordinates preserves every
    // distance and containment claim; accepted BReps are never modified.
    gp_Trsf frame; frame.SetTransformation(*axes);
    return {BRepBuilderAPI_Transform(source, frame, true).Shape(),
            BRepBuilderAPI_Transform(candidate, frame, true).Shape()};
}
