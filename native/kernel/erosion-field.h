#pragma once
#include "mesh-fit.h"
#include <functional>

namespace erosion {
// Temporary level-set proposal only. Its samples are not an erosion certificate.
mesh_fit::Mesh contourField(const mesh_fit::V& low,const mesh_fit::V& high,double spacing,
                           const std::function<double(const mesh_fit::V&)>& field, bool refineRoots = false);
mesh_fit::Mesh interiorMesh(const TopoDS_Shape&,double depth,double allowance);
std::vector<mesh_fit::Mesh> interiorComponents(const mesh_fit::Mesh&);
mesh_fit::Mesh offsetInteriorMesh(const mesh_fit::Mesh&,double radius,double allowance);
std::optional<TopoDS_Shape> boxInterior(const TopoDS_Shape&,const mesh_fit::Mesh&,double thickness,double allowance);
TopoDS_Shape sectionInterior(const TopoDS_Shape&,const mesh_fit::Mesh&,double thickness,double allowance);
TopoDS_Shape reconstructInterior(const TopoDS_Shape&,double thickness,double allowance);
}
