#include "boundary-move.h"
#include "boundary-validation.h"
#include "scale-transform.h"
#include <BRep_Tool.hxx>
#include <gp_Ax1.hxx>

namespace boundary_move {
bool Edit::affected(const TopoDS_Shape& shape) const {
    for (TopExp_Explorer it(shape, TopAbs_VERTEX); it.More(); it.Next())
        if (movedVertices.Contains(it.Current())) return true;
    return false;
}
gp_Pnt Edit::moved(const TopoDS_Vertex& vertex) const {
    auto p = BRep_Tool::Pnt(vertex);
    if (movedVertices.Contains(vertex)) {
        auto xyz = p.XYZ();
        transform.Transforms(xyz);
        p.SetXYZ(xyz);
    }
    return p;
}
TopoDS_Edge Edit::edge(const TopoDS_Edge& original) const {
    auto result = edges.at(sourceEdges.FindIndex(original) - 1);
    result.Orientation(original.Orientation());
    return result;
}
namespace {
void addTargets(Edit& edit, const Tree& input, const std::vector<Operand>& bodies,
                const char* list, const char* key, TopAbs_ShapeEnum type) {
    const auto targets = input.get_child_optional(list);
    if (!targets) return;
    auto& selected = type == TopAbs_FACE ? edit.rigidFaces : edit.rigidEdges;
    for (const auto& item : *targets) {
        const auto bodyId = item.second.get<std::string>("body");
        const auto id = item.second.get<std::string>(key);
        const Operand* found = nullptr;
        for (const auto& body : bodies) if (body.id == bodyId) found = &body;
        require(found && (!edit.body || edit.body == found), "Move boundaries of one body at a time");
        edit.body = found;
        bool matched = false;
        for (const auto& entity : found->entities) {
            if (entity.id != id || entity.shape.ShapeType() != type) continue;
            require(!selected.Contains(entity.shape), "Select each boundary once");
            selected.Add(entity.shape);
            matched = true;
        }
        require(matched, "Selected boundary no longer exists");
    }
}
void carryFaces(Edit& edit) {
    for (int i = 1; i <= edit.rigidFaces.Extent(); ++i)
        TopExp::MapShapes(edit.rigidFaces(i), TopAbs_EDGE, edit.rigidEdges);
    for (const auto& face : boundary_move::faces(edit.body->shape)) {
        if (edit.rigidFaces.Contains(face)) continue;
        bool complete = true;
        int boundaryCount = 0;
        for (TopExp_Explorer it(face, TopAbs_EDGE); it.More(); it.Next()) {
            const auto edge = TopoDS::Edge(it.Current());
            if (BRep_Tool::IsClosed(edge, face) || BRep_Tool::Degenerated(edge)) continue;
            ++boundaryCount;
            complete &= edit.rigidEdges.Contains(edge);
        }
        if (complete && boundaryCount) {
            edit.rigidFaces.Add(face);
            TopExp::MapShapes(face, TopAbs_EDGE, edit.rigidEdges);
        }
    }
    for (int i = 1; i <= edit.rigidEdges.Extent(); ++i)
        TopExp::MapShapes(edit.rigidEdges(i), TopAbs_VERTEX, edit.movedVertices);
}
}
Edit selection(const Tree& input, const std::vector<Operand>& bodies) {
    Edit edit;
    if (input.get<std::string>("kind") == "scale-boundaries") {
        edit.transform = scaleTransform(input);
    } else {
        const auto translation = point(input.get_child("translation"));
        require(std::isfinite(translation.X()) && std::isfinite(translation.Y())
                && std::isfinite(translation.Z()), "Enter a finite movement");
        gp_Trsf movement;
        movement.SetTranslation(gp_Vec(translation.X(), translation.Y(), translation.Z()));
        edit.transform = gp_GTrsf(movement);
        const double angle = input.get<double>("angle", 0);
        require(std::isfinite(angle), "Enter a finite rotation");
        if (angle != 0) {
            const auto pivot = point(input.get_child("pivot"));
            const auto axis = point(input.get_child("axis"));
            gp_Trsf rotation;
            rotation.SetRotation(gp_Ax1(pivot, gp_Dir(axis.X(), axis.Y(), axis.Z())),
                                 angle * std::acos(-1) / 180);
            edit.transform = edit.transform * gp_GTrsf(rotation);
        }
    }
    addTargets(edit, input, bodies, "faces", "face", TopAbs_FACE);
    addTargets(edit, input, bodies, "edges", "edge", TopAbs_EDGE);
    require(edit.body && (edit.rigidFaces.Extent() || edit.rigidEdges.Extent()), "Select faces or edges to move");
    carryFaces(edit);
    return edit;
}
}
