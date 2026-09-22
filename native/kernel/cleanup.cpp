#include "kernel.h"
#include <ShapeUpgrade_UnifySameDomain.hxx>
#include <BRep_Tool.hxx>
#include <TopoDS.hxx>
#include <TopExp.hxx>
#include <TopExp_Explorer.hxx>
#include <TopTools_IndexedMapOfShape.hxx>
#include <TopTools_MapOfShape.hxx>
#include <TopTools_ListIteratorOfListOfShape.hxx>
#include <algorithm>
#include <cmath>
#include <set>
#include <stdexcept>

namespace {
TopTools_MapOfShape eligibleEdges(const Tree& selection, const Operand& body) {
    TopTools_MapOfShape eligible;
    if (selection.get<bool>("whole", false)) {
        for (TopExp_Explorer e(body.shape, TopAbs_EDGE); e.More(); e.Next()) eligible.Add(e.Current());
        return eligible;
    }
    for (const auto type : {TopAbs_EDGE, TopAbs_FACE}) {
        for (const auto& item : selection.get_child(type == TopAbs_EDGE ? "edges" : "faces")) {
            const auto id = item.second.get_value<std::string>();
            const auto found = std::find_if(body.entities.begin(), body.entities.end(), [&](const SourceEntity& e) {
                return e.id == id && e.shape.ShapeType() == type;
            });
            if (found == body.entities.end()) throw std::runtime_error("Cleanup selection no longer exists");
            if (type == TopAbs_EDGE) eligible.Add(found->shape);
            else for (TopExp_Explorer e(found->shape, TopAbs_EDGE); e.More(); e.Next()) eligible.Add(e.Current());
        }
    }
    return eligible;
}
}
Result cleanupEdges(const Operand& body, const TopTools_MapOfShape& eligible) {
    ShapeUpgrade_UnifySameDomain unify(body.shape, true, true, false);
    unify.SetSafeInputMode(true);
    TopTools_MapOfShape seams, touchedVertices;
    for (TopTools_MapOfShape::Iterator e(eligible); e.More(); e.Next())
        for (TopExp_Explorer v(e.Key(), TopAbs_VERTEX); v.More(); v.Next()) touchedVertices.Add(v.Current());
    for (TopExp_Explorer f(body.shape, TopAbs_FACE); f.More(); f.Next())
        for (TopExp_Explorer e(f.Current(), TopAbs_EDGE); e.More(); e.Next())
            if (BRep_Tool::IsClosed(TopoDS::Edge(e.Current()), TopoDS::Face(f.Current()))) seams.Add(e.Current());
    // Periodic seams are kernel bookkeeping, not visible selectable boundaries;
    // they must be allowed to reconnect when selected circular ribs disappear.
    // Preserve unselected face boundaries. Only selected-edge endpoints may be
    // absorbed into a continuous neighboring edge; remote breakpoints stay put.
    for (TopExp_Explorer e(body.shape, TopAbs_EDGE); e.More(); e.Next()) {
        if (eligible.Contains(e.Current()) || seams.Contains(e.Current())) continue;
        unify.KeepShape(e.Current());
        for (TopExp_Explorer v(e.Current(), TopAbs_VERTEX); v.More(); v.Next())
            if (!touchedVertices.Contains(v.Current())) unify.KeepShape(v.Current());
    }
    unify.Build();
    validate(unify.Shape());
    if (std::abs(volume(unify.Shape()) - volume(body.shape)) > 1e-7 * std::max(1.0, volume(body.shape)))
        throw std::runtime_error("Cleanup changed solid volume");
    std::vector<SourceEntity> origins;
    const auto history = unify.History();
    for (const auto& source : body.entities) {
        if (!history->IsRemoved(source.shape)) origins.push_back(source);
        for (const auto* list : {&history->Modified(source.shape), &history->Generated(source.shape)})
            for (TopTools_ListIteratorOfListOfShape i(*list); i.More(); i.Next())
                if (i.Value().ShapeType() == source.shape.ShapeType()) origins.push_back({source.id, i.Value()});
    }
    std::vector<Result> results;
    solids(results, unify.Shape(), origins, {body.id});
    if (results.size() != 1) throw std::runtime_error("Cleanup changed the body count");
    return results.front();
}
std::vector<Result> cleanupBodies(const Tree& input, const std::vector<Operand>& bodies,
                                  std::vector<std::string>& participants) {
    std::vector<Result> results;
    std::set<std::string> seen;
    for (const auto& item : input.get_child("selection")) {
        const auto id = item.second.get<std::string>("body");
        if (!seen.insert(id).second) throw std::runtime_error("Duplicate cleanup body");
        const auto found = std::find_if(bodies.begin(), bodies.end(), [&](const Operand& b) { return b.id == id; });
        if (found == bodies.end()) throw std::runtime_error("Cleanup body no longer exists");
        const auto result = cleanupEdges(*found, eligibleEdges(item.second, *found));
        TopTools_IndexedMapOfShape before, after;
        TopExp::MapShapes(found->shape, before); TopExp::MapShapes(result.shape, after);
        // A no-op must not remesh/reorder accepted data or add an Undo step.
        if (before.Extent() == after.Extent()) continue;
        participants.push_back(id);
        results.push_back(result);
    }
    return results;
}
