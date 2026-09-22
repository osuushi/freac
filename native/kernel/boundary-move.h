#pragma once
#include "kernel.h"
#include <TopTools_IndexedMapOfShape.hxx>
#include <TopoDS_Edge.hxx>
#include <TopoDS_Vertex.hxx>
#include <gp_Trsf.hxx>

// Boundary neighborhood model shared by edge and face selection.
namespace boundary_move {
constexpr double tolerance = 1e-6;
struct Edit {
    const Operand* body = nullptr;
    gp_Trsf transform;
    TopTools_IndexedMapOfShape rigidFaces, rigidEdges, movedVertices;
    TopTools_IndexedMapOfShape sourceEdges;
    std::vector<TopoDS_Edge> edges;
    bool affected(const TopoDS_Shape&) const;
    gp_Pnt moved(const TopoDS_Vertex&) const;
    TopoDS_Edge edge(const TopoDS_Edge&) const;
};
Edit selection(const Tree&, const std::vector<Operand>&);
void buildEdges(Edit&);
TopoDS_Face rebuildFace(const TopoDS_Face&, const Edit&);
TopoDS_Face cylinderFace(const TopoDS_Face&, const Edit&);
Result reconstruct(const Edit&);
bool sameBoundary(const TopoDS_Edge&, const TopoDS_Edge&);
}
std::vector<Result> reconnectBoundaries(const Tree&, const std::vector<Operand>&,
                                      std::vector<std::string>&);
