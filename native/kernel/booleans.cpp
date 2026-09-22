#include "kernel.h"
#include "boolean-periodic.h"
#include <BRepCheck_Analyzer.hxx>
#include <BRepAlgoAPI_Common.hxx>
#include <BRepAlgoAPI_Cut.hxx>
#include <BRepAlgoAPI_Fuse.hxx>
#include <TopExp_Explorer.hxx>
#include <TopTools_ListIteratorOfListOfShape.hxx>
#include <OSD_ThreadPool.hxx>
#include <algorithm>
#include <memory>
#include <set>
#include <stdexcept>

TopoDS_Shape booleanShape(const TopoDS_Shape& a, const TopoDS_Shape& b, const std::string& mode,
                         std::vector<SourceEntity>& origins) {
    std::unique_ptr<BRepAlgoAPI_BooleanOperation> operation;
    if (mode == "union") operation = std::make_unique<BRepAlgoAPI_Fuse>();
    else if (mode == "subtract") operation = std::make_unique<BRepAlgoAPI_Cut>();
    else operation = std::make_unique<BRepAlgoAPI_Common>();
    TopTools_ListOfShape arguments, tools; arguments.Append(a); tools.Append(b);
    operation->SetArguments(arguments); operation->SetTools(tools);
    operation->SetRunParallel(OSD_ThreadPool::DefaultPool()->HasThreads());
    operation->SetNonDestructive(true); operation->Build();
    if (!operation->IsDone() || operation->HasErrors()) throw std::runtime_error("Boolean operation failed");
    if (mode == "subtract" && !operation->Shape().IsNull() &&
        !BRepCheck_Analyzer(operation->Shape()).IsValid()) {
        const auto prepared = splitFailedCutFaces(a, *operation, origins);
        operation = std::make_unique<BRepAlgoAPI_Cut>();
        arguments.Clear(); arguments.Append(prepared);
        operation->SetArguments(arguments); operation->SetTools(tools);
        operation->SetRunParallel(OSD_ThreadPool::DefaultPool()->HasThreads());
        operation->SetNonDestructive(true); operation->Build();
        if (!operation->IsDone() || operation->HasErrors()) throw std::runtime_error("Boolean operation failed");
    }
    const auto result = operation->Shape();
    if (!result.IsNull()) validate(result);
    std::vector<SourceEntity> next;
    for (const auto& origin : origins) {
        if (!operation->IsDeleted(origin.shape)) next.push_back(origin);
        for (const auto* list : {&operation->Modified(origin.shape), &operation->Generated(origin.shape)})
            for (TopTools_ListIteratorOfListOfShape i(*list); i.More(); i.Next())
                if (i.Value().ShapeType() == origin.shape.ShapeType()) next.push_back({origin.id, i.Value()});
    }
    origins = std::move(next);
    return result;
}
void solids(std::vector<Result>& results, const TopoDS_Shape& shape,
            const std::vector<SourceEntity>& origins, const std::vector<std::string>& bodies) {
    if (shape.IsNull()) return;
    for (TopExp_Explorer e(shape, TopAbs_SOLID); e.More(); e.Next()) {
        validate(e.Current());
        if (volume(e.Current()) > 1e-12) results.push_back({e.Current(), origins, bodies});
    }
}

std::vector<Result> booleanBodies(const Tree& input, const std::vector<Operand>& bodies,
                                  std::vector<std::string>& participants) {
    const auto mode = input.get<std::string>("mode");
    if (mode != "union" && mode != "subtract" && mode != "intersect")
        throw std::runtime_error("Unknown Boolean mode");
    const bool keep = input.get<bool>("keepOriginals", false);
    std::vector<const Operand*> selected;
    std::set<std::string> unique;
    for (const auto& item : input.get_child("ids")) {
        const auto id = item.second.get_value<std::string>();
        if (!unique.insert(id).second) throw std::runtime_error("Select each body only once");
        const auto found = std::find_if(bodies.begin(), bodies.end(), [&](const Operand& b) { return b.id == id; });
        if (found == bodies.end()) throw std::runtime_error("Selected body no longer exists");
        selected.push_back(&*found);
    }
    if (selected.size() < 2) throw std::runtime_error("Select at least two bodies");
    // Only consumed entities may pass on their identities: retained originals must
    // never share document-local IDs with the independently editable result.
    for (std::size_t i = 0; i < selected.size(); ++i)
        if (!keep || (mode == "subtract" && i == 0)) participants.push_back(selected[i]->id);
    auto shape = selected.front()->shape;
    std::vector<SourceEntity> origins;
    if (!keep || mode == "subtract") origins = selected.front()->entities;
    for (std::size_t i = 1; i < selected.size(); ++i) {
        if (!keep) origins.insert(origins.end(), selected[i]->entities.begin(), selected[i]->entities.end());
        shape = booleanShape(shape, selected[i]->shape, mode, origins);
    }
    std::vector<Result> results;
    const auto predecessors = mode == "subtract" ? std::vector<std::string>{selected.front()->id} : participants;
    solids(results, shape, origins, predecessors);
    return results;
}
