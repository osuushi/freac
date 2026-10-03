#include "erosion-field.h"
#include "erosion.h"
#include "mesh-fit-analytic.h"
#include "timing.h"
#include <BRepBndLib.hxx>
#include <BRepBuilderAPI_Copy.hxx>
#include <BRepClass3d_SolidClassifier.hxx>
#include <BRepMesh_IncrementalMesh.hxx>
#include <BRep_Tool.hxx>
#include <BRep_Builder.hxx>
#include <Bnd_Box.hxx>
#include <Poly_Triangulation.hxx>
#include <TopExp_Explorer.hxx>
#include <TopoDS.hxx>
#include <TopoDS_Compound.hxx>
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
mesh_fit::Input pieceInput(mesh_fit::Mesh piece,double allowance) {
    auto low=piece.vertices[0],high=low;
    for(const auto& p:piece.vertices) for(int axis=1;axis<=3;++axis) {
        low.SetCoord(axis,std::min(low.Coord(axis),p.Coord(axis)));
        high.SetCoord(axis,std::max(high.Coord(axis),p.Coord(axis)));
    }
    return mesh_fit::automaticInput(std::move(piece),std::min(allowance/8,(high-low).Modulus()/20),256);
}
std::optional<TopoDS_Shape> analyticInterior(const TopoDS_Shape& source,const std::vector<mesh_fit::Mesh>& pieces,
                                          double thickness,double allowance) {
    if(pieces.empty()) return {};
    try {
        TopoDS_Compound candidate;BRep_Builder builder;builder.MakeCompound(candidate);
        for(const auto& piece:pieces) {
            auto input=pieceInput(piece,allowance);
            // A coarse field has its own discretization error. Analytic proposals
            // may use the remaining wall allowance, then face the exact source
            // certificate; they are not accepted on this mesh fit alone.
            input.tolerance=std::min(allowance/(2*input.scale),0.05);
            const auto fitted=mesh_fit::analytic::reconstruct(input);
            if(!fitted) return {};
            builder.Add(candidate,fitted->shape);
        }
        validateCavity(source,candidate,thickness,allowance);
        return candidate;
    } catch(const Standard_Failure&) {return {};}
    catch(const std::runtime_error&) {return {};}
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
    if (allowance < 1e-4) throw std::runtime_error("Fast erosion needs at least 0.0001 mm extra allowance. Use Accurate for zero allowance.");
    const auto mesh = interiorMesh(source,thickness+allowance/2,allowance);
    if(const auto box=boxInterior(source,mesh,thickness,allowance)) return *box;
    auto pieces=interiorComponents(mesh);
    if(const auto analytic=analyticInterior(source,pieces,thickness,allowance)) return *analytic;
    std::vector<mesh_fit::Input> inputs;
    for(auto& piece:pieces) {
        auto input=pieceInput(std::move(piece),allowance);
        const auto layout=mesh_fit::radialLayout(input.target,24);
        if(!layout) return sectionInterior(source,mesh,thickness,allowance);
        input.layout=*layout;
        inputs.push_back(std::move(input));
    }
    TopoDS_Compound candidate;
    BRep_Builder builder;builder.MakeCompound(candidate);
    for(auto& input:inputs) {
        if(const auto analytic=mesh_fit::analytic::reconstruct(input)) builder.Add(candidate,analytic->shape);
        else builder.Add(candidate,mesh_fit::fitSurface(std::move(input)).shape);
    }
    validateCavity(source,candidate,thickness,allowance);
    return candidate;
}
}
