#include "erosion-field.h"
#include "erosion.h"
#include "mesh-fit-analytic.h"
#include <BRep_Builder.hxx>
#include <TopoDS_Compound.hxx>
#include <algorithm>
#include <stdexcept>

namespace erosion {
namespace {
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
TopoDS_Shape reconstructInterior(const TopoDS_Shape& source,double thickness,double allowance) {
    if (allowance < 1e-4) throw std::runtime_error("Fast erosion needs at least 0.0001 mm extra allowance. Use Accurate for zero allowance.");
    const auto mesh = interiorMesh(source,thickness+allowance/2,allowance);
    if(const auto box=boxInterior(source,mesh,thickness,allowance)) return *box;
    auto pieces=interiorComponents(mesh);
    if(const auto analytic=analyticInterior(source,pieces,thickness,allowance)) return *analytic;
    std::vector<mesh_fit::Input> inputs;
    for(auto& piece:pieces) {
        std::vector<std::vector<int>> faces;
        for(const auto& triangle:piece.triangles) faces.push_back({triangle[0],triangle[1],triangle[2]});
        if(mesh_fit::topology(piece.vertices,faces,"Erosion mesh") != 2)
            return sectionInterior(source,mesh,thickness,allowance);

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
