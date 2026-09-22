#include "kernel.h"
#include <BRepLib.hxx>
#include <TopExp.hxx>
#include <TopTools_IndexedDataMapOfShapeListOfShape.hxx>
#include <TopTools_ListIteratorOfListOfShape.hxx>
#include <TopoDS.hxx>
#include <algorithm>

std::vector<TopoDS_Face> tangentFaceChain(const TopoDS_Shape& shape, const std::vector<TopoDS_Face>& seeds) {
    TopTools_IndexedDataMapOfShapeListOfShape adjacency;
    TopExp::MapShapesAndAncestors(shape, TopAbs_EDGE, TopAbs_FACE, adjacency);
    auto result = seeds;
    for (size_t f = 0; f < result.size(); ++f) {
        const auto face = result[f];
        for (int e = 1; e <= adjacency.Extent(); ++e) {
            const auto& neighbors = adjacency.FindFromIndex(e);
            bool incident = false;
            for (TopTools_ListIteratorOfListOfShape i(neighbors); i.More(); i.Next())
                if (i.Value().IsSame(face)) incident = true;
            if (!incident) continue;
            for (TopTools_ListIteratorOfListOfShape i(neighbors); i.More(); i.Next()) {
                const auto other = TopoDS::Face(i.Value());
                if (std::any_of(result.begin(), result.end(), [&](const TopoDS_Face& f) { return f.IsSame(other); })) continue;
                if (BRepLib::ContinuityOfFaces(TopoDS::Edge(adjacency.FindKey(e)), face, other, 1e-5) >= GeomAbs_G1)
                    result.push_back(other);
            }
        }
    }
    return result;
}
