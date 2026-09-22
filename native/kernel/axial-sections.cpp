#include "screw-sweep.h"
#include <BRepAdaptor_Surface.hxx>
#include <BRepAlgoAPI_Splitter.hxx>
#include <BRepBndLib.hxx>
#include <BRepBuilderAPI_MakeFace.hxx>
#include <BRepBuilderAPI_Transform.hxx>
#include <Bnd_Box.hxx>
#include <TopExp_Explorer.hxx>
#include <TopoDS.hxx>
#include <gp_Pln.hxx>
#include <stdexcept>

std::vector<TopoDS_Face> axialSections(const TopoDS_Face& face, const gp_Ax1& axis) {
    BRepAdaptor_Surface surface(face);
    if (surface.GetType() != GeomAbs_Plane) throw std::runtime_error("Revolve needs planar profiles");
    const auto plane = surface.Plane();
    if (plane.Distance(axis.Location()) > 1e-7 || std::abs(plane.Axis().Direction().Dot(axis.Direction())) > 1e-7)
        throw std::runtime_error("Choose an axis in the profile plane");
    const gp_Dir radial = axis.Direction().Crossed(plane.Axis().Direction());
    gp_Trsf local; local.SetTransformation(gp_Ax3(axis.Location(), plane.Axis().Direction(), radial));
    Bnd_Box bounds;
    BRepBndLib::AddOptimal(BRepBuilderAPI_Transform(face, local, true).Shape(), bounds, false, false);
    bounds.SetGap(0);
    double x0,y0,z0,x1,y1,z1; bounds.Get(x0,y0,z0,x1,y1,z1);
    if (x0 >= -1e-7 || x1 <= 1e-7) return {face};
    // An unbounded perpendicular plane splits the actual analytic face and its
    // holes at the axis. No polygonization or sketch constraint edits are involved.
    BRepAlgoAPI_Splitter split;
    TopTools_ListOfShape arguments, tools;
    arguments.Append(face);
    tools.Append(BRepBuilderAPI_MakeFace(gp_Pln(axis.Location(), radial)).Face());
    split.SetArguments(arguments); split.SetTools(tools); split.SetNonDestructive(true); split.Build();
    if (!split.IsDone() || split.HasErrors()) throw std::runtime_error("Cannot split profile at its revolution axis");
    std::vector<TopoDS_Face> faces;
    for (TopExp_Explorer e(split.Shape(), TopAbs_FACE); e.More(); e.Next()) {
        validate(e.Current()); faces.push_back(TopoDS::Face(e.Current()));
    }
    if (faces.empty()) throw std::runtime_error("Axis split produced no profile sections");
    return faces;
}
