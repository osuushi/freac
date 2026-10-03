#include "erosion-field-sampling.h"
#include "timing.h"
#include <BRepBndLib.hxx>
#include <BRepBuilderAPI_Copy.hxx>
#include <BRepClass3d_SolidClassifier.hxx>
#include <BRepMesh_IncrementalMesh.hxx>
#include <BRep_Tool.hxx>
#include <Bnd_Box.hxx>
#include <Poly_Triangulation.hxx>
#include <TopExp_Explorer.hxx>
#include <TopoDS.hxx>
#include <cmath>
#include <stdexcept>

namespace erosion {
namespace {
mesh_fit::Mesh tessellate(const TopoDS_Shape& source,double deflection) {
    BRepMesh_IncrementalMesh mesher(source,deflection,false,0.15,false);
    if (!mesher.IsDone()) throw std::runtime_error("Erode could not sample source surfaces");
    mesh_fit::Mesh result;
    for (TopExp_Explorer faces(source,TopAbs_FACE); faces.More(); faces.Next()) {
        const auto face = TopoDS::Face(faces.Current());
        TopLoc_Location location;
        const auto triangles = BRep_Tool::Triangulation(face,location);
        if (triangles.IsNull()) throw std::runtime_error("Erode could not sample every source face");
        const int base = int(result.vertices.size());
        for (int i = 1; i <= triangles->NbNodes(); ++i)
            result.vertices.push_back(triangles->Node(i).Transformed(location.Transformation()).XYZ());
        for (int i = 1; i <= triangles->NbTriangles(); ++i) {
            int a,b,c; triangles->Triangle(i).Get(a,b,c);
            if (face.Orientation() == TopAbs_REVERSED) std::swap(b,c);
            result.triangles.push_back({base+a-1,base+b-1,base+c-1});
        }
        if (result.triangles.size() > 200000) throw std::runtime_error("Erode source mesh exceeds sampling budget");
    }
    return result;
}
}
struct InteriorField::Impl {
    TopoDS_Shape source;
    mesh_fit::Mesh mesh;
    mesh_fit::Search search;
    BRepClass3d_SolidClassifier classifier;
    explicit Impl(const TopoDS_Shape& shape, double allowance) :
        source(BRepBuilderAPI_Copy(shape,true,false).Shape()),
        mesh(tessellate(source,std::max(1e-5,allowance/32))), search(mesh), classifier(source) {}
};
InteriorField::InteriorField(const TopoDS_Shape& source,double allowance) :
    impl(std::make_unique<Impl>(source,allowance)) {}
InteriorField::~InteriorField() = default;
double InteriorField::value(const mesh_fit::V& point,double depth) const {
    const double distance = std::sqrt(impl->search.closest(point).distance2);
    if (distance <= depth) return distance-depth;
    if (const auto inside = impl->search.contains(point)) return (*inside ? distance : -distance)-depth;
    impl->classifier.Perform(gp_Pnt(point),1e-7);
    if (impl->classifier.State() == TopAbs_IN) return distance-depth;
    if (impl->classifier.State() == TopAbs_OUT || impl->classifier.State() == TopAbs_ON) return -distance-depth;
    throw std::runtime_error("Erode could not classify a distance-field point");
}
mesh_fit::Mesh InteriorField::contour(double depth,double allowance,bool refine) const {
    KernelTiming timing("erode-field");
    Bnd_Box bounds; BRepBndLib::AddOptimal(impl->source,bounds,false,false);
    double x,y,z,X,Y,Z; bounds.Get(x,y,z,X,Y,Z);
    const double extent = std::max({X-x,Y-y,Z-z});
    const double resolution = std::clamp(std::ceil(6*std::sqrt(extent/allowance)),32.0,56.0);
    const double spacing = extent/resolution;
    const mesh_fit::V margin(spacing*0.371,spacing*0.371,spacing*0.371);
    auto result = contourField(mesh_fit::V(x,y,z)-margin,mesh_fit::V(X,Y,Z)+margin,spacing,
        [&](const mesh_fit::V& point) { return value(point,depth); },refine);
    timing.phase("contour");
    for (const auto& point : result.vertices) result.normals.push_back(impl->search.closest(point).normal);
    return result;
}
mesh_fit::Mesh interiorMesh(const TopoDS_Shape& source,double depth,double allowance) {
    return InteriorField(source,allowance).contour(depth,allowance);
}
}
