#include "erosion-field-planar.h"
#include "erosion.h"
#include "offset-geometry.h"
#include <BRepAdaptor_Surface.hxx>
#include <BRepExtrema_DistShapeShape.hxx>
#include <BRepGProp.hxx>
#include <BRep_Builder.hxx>
#include <GProp_GProps.hxx>
#include <TopExp_Explorer.hxx>
#include <TopoDS.hxx>
#include <TopoDS_Compound.hxx>
#include <gp_Pln.hxx>
#include <math_Jacobi.hxx>
#include <stdexcept>

namespace erosion {
namespace {
using namespace mesh_fit;
void appendAxis(std::vector<V>& axes,V axis) {
    axis = unit(axis);
    for (int i = 1; i <= 3; ++i) if (std::abs(axis.Coord(i)) > 1e-8) {
        if (axis.Coord(i) < 0) axis *= -1;
        break;
    }
    if (std::none_of(axes.begin(),axes.end(),[&](const auto& prior) {
        return std::abs(axis.Dot(prior)) > 1-1e-10;
    })) axes.push_back(axis);
}
std::vector<V> directions(const TopoDS_Shape& source,const Mesh& mesh) {
    std::vector<std::pair<double,V>> planes;
    for (TopExp_Explorer f(source,TopAbs_FACE); f.More(); f.Next()) {
        BRepAdaptor_Surface surface(TopoDS::Face(f.Current()));
        if (surface.GetType() != GeomAbs_Plane) continue;
        GProp_GProps properties; BRepGProp::SurfaceProperties(f.Current(),properties);
        planes.emplace_back(properties.Mass(),surface.Plane().Axis().Direction().XYZ());
    }
    std::sort(planes.begin(),planes.end(),[](const auto& a,const auto& b) { return a.first>b.first; });
    std::vector<V> result;
    for (const auto& [area,axis] : planes) appendAxis(result,axis);
    V center;
    for (const auto& point : mesh.vertices) center += point/double(mesh.vertices.size());
    math_Matrix covariance(1,3,1,3,0.0);
    for (const auto& point : mesh.vertices) for (int i = 1; i <= 3; ++i) for (int j = 1; j <= 3; ++j)
        covariance(i,j) += (point-center).Coord(i)*(point-center).Coord(j);
    math_Jacobi eigen(covariance);
    std::vector<std::pair<double,V>> principal;
    if (eigen.IsDone()) for (int i = 1; i <= 3; ++i) {
        math_Vector value(1,3); eigen.Vector(i,value);
        const V axis = unit({value(1),value(2),value(3)});
        const sections::Frame frame(mesh,axis);
        principal.emplace_back(frame.high.Z()-frame.low.Z(),axis);
    }
    std::sort(principal.begin(),principal.end(),[](const auto& a,const auto& b) { return a.first<b.first; });
    for (const auto& [extent,axis] : principal) appendAxis(result,axis);
    for (const auto& axis : std::array<V,3>{{{1,0,0},{0,1,0},{0,0,1}}}) appendAxis(result,axis);
    return result;
}
TopoDS_Shape along(const InteriorField& field,const Mesh& mesh,const V& axis,
                   double thickness,double allowance,sections::Budget& budget) {
    const sections::Frame frame(mesh,axis);
    const double depth = thickness+allowance/3, height = frame.high.Z()-frame.low.Z();
    if (height < 1e-6) throw std::runtime_error("Collapsed erosion section range");
    const double trim = std::min(0.02,allowance/(8*height));
    const double spacing = std::sqrt(allowance*(thickness+allowance/2));
    std::vector<sections::Loops> rows;
    for (int i = 0; i < 32; ++i) {
        const double h = frame.low.Z()+height*(trim+(1-2*trim)*i/31);
        auto loops = sections::contour(field,frame,h,depth,spacing,budget);
        sections::order(loops,rows.empty() ? sections::Loops{} : rows.back(),axis);
        for (size_t ring = 0; ring < loops.size(); ++ring)
            loops[ring] = sections::controls(loops[ring],rows.empty() ? sections::Loop{} : rows.back()[ring]);
        rows.push_back(std::move(loops));
    }
    return sections::solid(rows,axis,allowance);
}
}
std::optional<TopoDS_Shape> contourInterior(const TopoDS_Shape& source,double thickness,double allowance) {
    try {
        InteriorField field(source,allowance);
        const auto raw = field.contour(thickness+allowance/3,allowance,true);
        const auto sourceBoundary = boundary(source);
        TopoDS_Compound candidate; BRep_Builder builder; builder.MakeCompound(candidate);
        sections::Budget budget;
        for (const auto& piece : interiorComponents(raw)) {
            bool found = false;
            for (const auto& axis : directions(source,piece)) {
                try {
                    const auto proposal = along(field,piece,axis,thickness,allowance,budget);
                    offset_geometry::validSolid(proposal,"Erosion reconstruction");
                    BRepExtrema_DistShapeShape gap(sourceBoundary,boundary(proposal));
                    if (!gap.IsDone() || gap.Value() < thickness-geometry_policy::boundaryDistanceMm) continue;
                    builder.Add(candidate,proposal);
                    found = true;
                    break;
                } catch (const Standard_Failure&) {}
                catch (const std::runtime_error&) {}
            }
            if (!found) return {};
        }
        validateCavity(source,candidate,thickness,allowance);
        return candidate;
    } catch (const Standard_Failure&) { return {}; }
    catch (const std::runtime_error&) { return {}; }
}
}
