#include "erosion-field.h"
#include "erosion.h"
#include "mesh-fit-analytic.h"
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
mesh_fit::Mesh interiorMesh(const TopoDS_Shape& source,double depth,double allowance) {
    KernelTiming timing("erode-field");
    const auto copy = BRepBuilderAPI_Copy(source,true,false).Shape();
    const auto mesh = tessellate(copy,std::max(1e-5,allowance/32));
    mesh_fit::Search search(mesh);
    BRepClass3d_SolidClassifier classifier(copy);
    Bnd_Box bounds; BRepBndLib::AddOptimal(copy,bounds,false,false);
    double x,y,z,X,Y,Z; bounds.Get(x,y,z,X,Y,Z);
    const double extent = std::max({X-x,Y-y,Z-z});
    const double resolution = std::clamp(std::ceil(6*std::sqrt(extent/allowance)),32.0,56.0);
    const double spacing = extent/resolution;
    const mesh_fit::V margin(spacing*0.371,spacing*0.371,spacing*0.371);
    timing.phase("source-mesh");
    auto result = contourField(mesh_fit::V(x,y,z)-margin,mesh_fit::V(X,Y,Z)+margin,spacing,[&](const mesh_fit::V& point) {
        const double distance = std::sqrt(search.closest(point).distance2);
        // All points closer than the chosen depth are outside this level set,
        // regardless of which side of the original boundary they occupy.
        if (distance <= depth) return distance-depth;
        if (const auto inside = search.contains(point)) return (*inside ? distance : -distance)-depth;
        classifier.Perform(gp_Pnt(point),1e-7);
        if (classifier.State() == TopAbs_IN) return distance-depth;
        if (classifier.State() == TopAbs_OUT || classifier.State() == TopAbs_ON) return -distance-depth;
        throw std::runtime_error("Erode could not classify a distance-field point");
    });
    timing.phase("contour");
    // Grid tetrahedra provide positions, but their uneven facets bias averaged
    // normals. The original smooth boundary supplies fitting guidance only.
    for (const auto& point : result.vertices) result.normals.push_back(search.closest(point).normal);
    return result;
}
TopoDS_Shape reconstructInterior(const TopoDS_Shape& source,double thickness,double allowance) {
    if (allowance < 1e-4) throw std::runtime_error("Distance reconstruction requires positive extra thickness allowance");
    const auto mesh = interiorMesh(source,thickness+allowance/2,allowance);
    auto input = mesh_fit::automaticInput(mesh,allowance/8,96);
    TopoDS_Shape candidate;
    if (const auto analytic = mesh_fit::analytic::reconstruct(input)) candidate = analytic->shape;
    else {
        // A verified radial map avoids distortion from the irregular contour grid
        // on star-shaped interiors. Concave maps still use the general flow.
        if (const auto layout = mesh_fit::radialLayout(input.target,24)) input.layout = *layout;
        candidate = mesh_fit::fitSurface(input).shape;
    }
    validateCavity(source,candidate,thickness,allowance);
    return candidate;
}
}
