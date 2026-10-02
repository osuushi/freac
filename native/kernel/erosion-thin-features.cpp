#include "erosion.h"
#include "offset-repair.h"
#include <BRepAdaptor_Surface.hxx>
#include <BRepAlgoAPI_Defeaturing.hxx>
#include <BRepAlgoAPI_Cut.hxx>
#include <BRepBndLib.hxx>
#include <BRepBuilderAPI_Copy.hxx>
#include <BRepBuilderAPI_MakeFace.hxx>
#include <BRepBuilderAPI_Transform.hxx>
#include <BRepPrimAPI_MakeHalfSpace.hxx>
#include <Bnd_Box.hxx>
#include <BRep_Tool.hxx>
#include <GeomConvert_SurfToAnaSurf.hxx>
#include <Geom_ToroidalSurface.hxx>
#include <Standard_Failure.hxx>
#include <TopExp.hxx>
#include <TopExp_Explorer.hxx>
#include <TopTools_IndexedDataMapOfShapeListOfShape.hxx>
#include <TopTools_IndexedMapOfShape.hxx>
#include <TopTools_MapOfShape.hxx>
#include <TopoDS.hxx>
#include <TopoDS_Solid.hxx>
#include <gp_Cylinder.hxx>
#include <gp_Pln.hxx>
#include <stdexcept>
#include <cmath>

namespace {
bool collapsingRound(const TopoDS_Face& face, double thickness) {
    BRepAdaptor_Surface original(face);
    auto torus = Handle(Geom_ToroidalSurface)::DownCast(BRep_Tool::Surface(face));
    if (torus.IsNull() && (original.GetType() == GeomAbs_BSplineSurface || original.GetType() == GeomAbs_BezierSurface)) {
        GeomConvert_SurfToAnaSurf recognition(BRep_Tool::Surface(face));
        torus = Handle(Geom_ToroidalSurface)::DownCast(recognition.ConvertToAnalytical(1e-7,
            original.FirstUParameter(), original.LastUParameter(), original.FirstVParameter(), original.LastVParameter()));
        if (!std::isfinite(recognition.Gap()) || recognition.Gap() < 0 || recognition.Gap() > 1e-7) return false;
    }
    if (torus.IsNull() || torus->MinorRadius() >= thickness || torus->MajorRadius() <= torus->MinorRadius()) return false;
    gp_Pnt point; gp_Vec du, dv;
    original.D1((original.FirstUParameter()+original.LastUParameter())/2,
                (original.FirstVParameter()+original.LastVParameter())/2, point, du, dv);
    const gp_Vec axis(torus->Axis().Direction()), delta(torus->Location(), point);
    const double z = delta.Dot(axis);
    const gp_Vec radial = delta-axis*z;
    if (radial.Magnitude() < 1e-7) return false;
    const gp_Vec outward = radial*(1-torus->MajorRadius()/radial.Magnitude())+axis*z;
    return du.Crossed(dv).Dot(outward)*(face.Orientation() == TopAbs_REVERSED ? -1 : 1) > 0;
}
TopTools_MapOfShape thinBranches(const TopoDS_Shape& shape, double thickness) {
    TopTools_MapOfShape removable;
    TopTools_IndexedDataMapOfShapeListOfShape adjacent;
    TopExp::MapShapesAndAncestors(shape, TopAbs_EDGE, TopAbs_FACE, adjacent);
    for (TopExp_Explorer f(shape, TopAbs_FACE); f.More(); f.Next()) {
        const auto face = TopoDS::Face(f.Current());
        BRepAdaptor_Surface support(face);
        if (collapsingRound(face, thickness)) {
            removable.Add(face);
            continue;
        }
        if (support.GetType() != GeomAbs_Cylinder ||
            (face.Orientation() == TopAbs_FORWARD) != support.Cylinder().Direct() ||
            support.Cylinder().Radius() >= thickness) continue;
        removable.Add(face);
        TopTools_MapOfShape edges;
        for (TopExp_Explorer e(face, TopAbs_EDGE); e.More(); e.Next()) edges.Add(e.Current());
        for (TopTools_MapOfShape::Iterator e(edges); e.More(); e.Next()) {
            for (const auto& neighbor : adjacent.FindFromKey(e.Key())) {
                if (neighbor.IsSame(face) || BRepAdaptor_Surface(TopoDS::Face(neighbor)).GetType() != GeomAbs_Plane) continue;
                bool cap = true;
                for (TopExp_Explorer boundary(neighbor, TopAbs_EDGE); boundary.More(); boundary.Next())
                    if (!edges.Contains(boundary.Current())) cap = false;
                if (cap) removable.Add(neighbor);
            }
        }
    }
    return removable;
}
double furthest(const TopoDS_Shape& shape, const gp_Trsf& frame) {
    Bnd_Box box;
    BRepBndLib::AddOptimal(BRepBuilderAPI_Transform(shape, frame, true).Shape(), box, false, true);
    double x0, y0, z0, x1, y1, z1;
    box.Get(x0, y0, z0, x1, y1, z1);
    return z1;
}
TopoDS_Shape retainSupportingPlanes(const TopoDS_Shape& source, const TopoDS_Shape& proposal) {
    TopTools_ListOfShape tools;
    for (TopExp_Explorer f(source, TopAbs_FACE); f.More(); f.Next()) {
        const auto face = TopoDS::Face(f.Current());
        BRepAdaptor_Surface surface(face);
        if (surface.GetType() != GeomAbs_Plane) continue;
        const auto plane = surface.Plane();
        auto normal = plane.Axis().Direction();
        if ((face.Orientation() == TopAbs_FORWARD) != plane.Position().Direct()) normal.Reverse();
        gp_Trsf frame; frame.SetTransformation(gp_Ax3(plane.Location(), normal));
        if (furthest(source, frame) > 1e-6 || furthest(proposal, frame) <= 1e-6) continue;
        const auto boundary = BRepBuilderAPI_MakeFace(gp_Pln(plane.Location(), normal)).Face();
        tools.Append(BRepPrimAPI_MakeHalfSpace(boundary, plane.Location().Translated(gp_Vec(normal))).Solid());
    }
    if (tools.IsEmpty()) return proposal;
    // Defeaturing a collapsed round may also remove its planar cap. Preserve
    // globally supporting source planes with one cut of their exterior half-spaces.
    TopTools_ListOfShape arguments; arguments.Append(proposal);
    BRepAlgoAPI_Cut clip;
    clip.SetArguments(arguments); clip.SetTools(tools); clip.SetNonDestructive(true); clip.Build();
    if (!clip.IsDone() || clip.HasErrors() || clip.HasWarnings())
        throw std::runtime_error("Erosion could not preserve a cap while removing a collapsed feature");
    return clip.Shape();
}
}
TopoDS_Shape erosion::removeCollapsedFeatures(const TopoDS_Shape& source, double thickness) {
    const auto copy = BRepBuilderAPI_Copy(source, true, false).Shape();
    const auto removable = thinBranches(copy, thickness);
    if (removable.IsEmpty()) return source;
    try {
        BRepAlgoAPI_Defeaturing heal;
        heal.SetShape(copy);
        for (TopTools_MapOfShape::Iterator i(removable); i.More(); i.Next()) heal.AddFaceToRemove(i.Key());
        heal.Build();
        if (!heal.IsDone() || heal.HasErrors() || heal.HasWarnings()) return source;
        const auto clipped = retainSupportingPlanes(copy, heal.Shape());
        TopExp_Explorer solids(clipped, TopAbs_SOLID);
        if (!solids.More()) return source;
        const auto result = solids.Current(); solids.Next();
        if (solids.More()) return source;
        TopTools_IndexedMapOfShape before, after;
        TopExp::MapShapes(source, TopAbs_FACE, before);
        TopExp::MapShapes(result, TopAbs_FACE, after);
        if (after.Extent() >= before.Extent()) return source;
        offset_geometry::tightenGeneratedBoundaries(result, source);
        // This is only a construction proposal. Branch roots and collapsed
        // rounds still require full minimum-distance and original coverage checks.
        return result;
    } catch (const Standard_Failure&) { return source; }
      catch (const std::runtime_error&) { return source; }
}
