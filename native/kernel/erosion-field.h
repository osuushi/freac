#pragma once
#include "mesh-fit.h"
#include <functional>

namespace erosion {
// Temporary level-set proposal only. Its samples are not an erosion certificate.
mesh_fit::Mesh contourField(const mesh_fit::V& low,const mesh_fit::V& high,double spacing,
                           const std::function<double(const mesh_fit::V&)>& field);
mesh_fit::Mesh interiorMesh(const TopoDS_Shape&,double depth,double allowance);
TopoDS_Shape reconstructInterior(const TopoDS_Shape&,double thickness,double allowance);
}
