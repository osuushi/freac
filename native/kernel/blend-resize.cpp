#include "blends.h"
#include <BRepAlgoAPI_Defeaturing.hxx>
#include <BRepFilletAPI_MakeFillet.hxx>
#include <TopExp.hxx>
#include <TopTools_IndexedMapOfShape.hxx>
#include <TopTools_IndexedDataMapOfShapeListOfShape.hxx>
#include <TopTools_ListIteratorOfListOfShape.hxx>
#include <TopoDS.hxx>
#include <algorithm>
#include <cmath>
#include <stdexcept>

namespace {
bool contains(const std::vector<TopoDS_Face>& faces, const TopoDS_Shape& face) {
    return std::any_of(faces.begin(), faces.end(), [&](const TopoDS_Face& f) { return f.IsSame(face); });
}
template<class Operation>
std::vector<SourceEntity> trace(Operation& operation, const std::vector<SourceEntity>& originals) {
    std::vector<SourceEntity> result;
    for (const auto& source : originals) {
        if (!operation.IsDeleted(source.shape)) result.push_back(source);
        for (const auto* list : {&operation.Modified(source.shape), &operation.Generated(source.shape)})
            for (TopTools_ListIteratorOfListOfShape i(*list); i.More(); i.Next())
                if (i.Value().ShapeType() == source.shape.ShapeType()) result.push_back({source.id, i.Value()});
    }
    return result;
}
struct Pair { TopoDS_Face a, b; std::string origin; };
Result resize(const Operand& body, const std::vector<TopoDS_Face>& seeds, double radius) {
    const auto blends = recognizeBlends(body.shape);
    const auto selected = blendGroup(blends, seeds);
    std::vector<Pair> pairs;
    for (const auto& blend : blends) {
        if (!contains(selected, blend.face)) continue;
        std::vector<TopoDS_Face> supports;
        for (const auto& face : blend.supports) if (!contains(selected, face)) supports.push_back(face);
        const auto origin = std::find_if(body.entities.begin(), body.entities.end(), [&](const SourceEntity& e) { return e.shape.IsSame(blend.face); });
        if (supports.size() == 2 && origin != body.entities.end()) pairs.push_back({supports[0], supports[1], origin->id});
    }
    if (pairs.empty()) throw std::runtime_error("Could not resolve this fillet's supporting faces");
    BRepAlgoAPI_Defeaturing remove;
    remove.SetShape(body.shape);
    remove.SetToFillHistory(true);
    for (const auto& face : selected) remove.AddFaceToRemove(face);
    remove.Build();
    if (!remove.IsDone() || remove.HasErrors()) throw std::runtime_error("Could not recover the fillet's supporting edges");
    validate(remove.Shape());
    TopTools_IndexedMapOfShape remaining;
    TopExp::MapShapes(remove.Shape(), TopAbs_FACE, remaining);
    for (const auto& face : selected) if (remaining.Contains(face)) throw std::runtime_error("Could not remove this fillet for resizing");
    auto origins = trace(remove, body.entities);
    const auto images = [&](const TopoDS_Face& original, const TopoDS_Shape& current) {
        if (original.IsSame(current)) return true;
        for (TopTools_ListIteratorOfListOfShape i(remove.Modified(original)); i.More(); i.Next())
            if (i.Value().IsSame(current)) return true;
        return false;
    };
    TopTools_IndexedMapOfShape previousEdges;
    TopExp::MapShapes(body.shape, TopAbs_EDGE, previousEdges);
    TopTools_IndexedDataMapOfShapeListOfShape adjacency;
    TopExp::MapShapesAndAncestors(remove.Shape(), TopAbs_EDGE, TopAbs_FACE, adjacency);
    BRepFilletAPI_MakeFillet fillet(remove.Shape());
    std::vector<SourceEntity> replacementSeeds;
    for (int e = 1; e <= adjacency.Extent(); ++e) {
        const auto edge = TopoDS::Edge(adjacency.FindKey(e));
        if (previousEdges.Contains(edge)) continue;
        bool added = false;
        for (const auto& pair : pairs) {
            bool a = false, b = false;
            for (TopTools_ListIteratorOfListOfShape i(adjacency.FindFromIndex(e)); i.More(); i.Next()) {
                a |= images(pair.a, i.Value()); b |= images(pair.b, i.Value());
            }
            if (!a || !b) continue;
            if (!added) fillet.Add(radius, edge);
            added = true;
            replacementSeeds.push_back({pair.origin, edge});
        }
    }
    if (replacementSeeds.empty()) throw std::runtime_error("Could not identify the recovered fillet edges");
    fillet.Build();
    if (!fillet.IsDone()) throw std::runtime_error("Fillet cannot use that radius with its current neighbors");
    validate(fillet.Shape());
    origins = trace(fillet, origins);
    for (const auto& seed : replacementSeeds)
        for (TopTools_ListIteratorOfListOfShape i(fillet.Generated(seed.shape)); i.More(); i.Next())
            if (i.Value().ShapeType() == TopAbs_FACE) origins.push_back({seed.id, i.Value()});
    for (const auto& original : body.entities) {
        if (original.shape.ShapeType() != TopAbs_FACE || contains(selected, original.shape)) continue;
        for (const auto& current : origins)
            if (current.id == original.id && current.shape.ShapeType() == TopAbs_FACE)
                checkUnselectedSupport(TopoDS::Face(original.shape), TopoDS::Face(current.shape));
    }
    std::vector<Result> results;
    solids(results, fillet.Shape(), origins, {body.id});
    if (results.size() != 1) throw std::runtime_error("Fillet resize must leave a valid solid");
    return results[0];
}
}
std::vector<Result> resizeBlends(const Tree& input, const std::vector<Operand>& bodies,
                               std::vector<std::string>& participants) {
    const double radius = input.get<double>("radius");
    if (!std::isfinite(radius) || radius <= 1e-7) throw std::runtime_error("Fillet radius must be greater than zero");
    std::vector<Result> results;
    size_t count = 0;
    for (const auto& body : bodies) {
        std::vector<TopoDS_Face> selected;
        for (const auto& item : input.get_child("faces")) {
            if (item.second.get<std::string>("body") != body.id) continue;
            const auto id = item.second.get<std::string>("face");
            const auto face = std::find_if(body.entities.begin(), body.entities.end(), [&](const SourceEntity& e) { return e.id == id && e.shape.ShapeType() == TopAbs_FACE; });
            if (face == body.entities.end()) throw std::runtime_error("Selected face does not belong to this body");
            if (contains(selected, face->shape)) throw std::runtime_error("Select each fillet face only once");
            selected.push_back(TopoDS::Face(face->shape)); ++count;
        }
        if (selected.empty()) continue;
        results.push_back(resize(body, selected, radius)); participants.push_back(body.id);
    }
    if (!count || count != input.get_child("faces").size()) throw std::runtime_error("Select existing fillet faces");
    return results;
}
