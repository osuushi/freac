#include "offset-repair.h"
#include <BRepBuilderAPI_Copy.hxx>
#include <BRepPrimAPI_MakeBox.hxx>
#include <BRepCheck_Analyzer.hxx>
#include <BRep_Builder.hxx>
#include <BRep_Tool.hxx>
#include <TopExp.hxx>
#include <TopTools_IndexedMapOfShape.hxx>
#include <TopoDS.hxx>
#include <TopoDS_Vertex.hxx>
#include <TopoDS_Edge.hxx>
#include <Geom_Curve.hxx>
#include <gp_Trsf.hxx>
#include <stdexcept>

void require(bool condition, const char* message) {
    if (!condition) throw std::runtime_error(message);
}
int main() {
    const auto source = BRepPrimAPI_MakeBox(10, 10, 10).Shape();
    for (const double displacement : {0.0005, 0.002}) {
        BRepBuilderAPI_Copy copy(source, true, false);
        const auto shape = copy.Shape();
        TopTools_IndexedMapOfShape vertices;
        TopExp::MapShapes(shape, TopAbs_VERTEX, vertices);
        const auto vertex = TopoDS::Vertex(vertices(1));
        const auto original = BRep_Tool::Pnt(vertex);
        BRep_Builder().UpdateVertex(vertex, original.Translated(gp_Vec(displacement, 0, 0)), displacement);
        bool failed = false;
        try { offset_geometry::tightenGeneratedBoundaries(shape, source); }
        catch (const std::runtime_error&) { failed = true; }
        require(failed == (displacement > 0.001), "The 0.001 mm shape adjustment budget must be enforced");
        if (!failed) {
            require(original.Distance(BRep_Tool::Pnt(vertex)) < 1e-7, "Shared vertex must meet all curve endpoints");
            require(BRepCheck_Analyzer(shape, true, false, true).IsValid(), "Repaired solid must remain valid");
        }
    }
    // A large shape budget cannot excuse an edge that misses either face.
    BRepBuilderAPI_Copy detached(source, true, false);
    TopTools_IndexedMapOfShape edges;
    TopExp::MapShapes(detached.Shape(), TopAbs_EDGE, edges);
    const auto edge = TopoDS::Edge(edges(1));
    double first, last;
    const auto curve = BRep_Tool::Curve(edge, first, last);
    gp_Trsf shift; shift.SetTranslation(gp_Vec(0.0005, 0.0005, 0.0005));
    BRep_Builder().UpdateEdge(edge, Handle(Geom_Curve)::DownCast(curve->Transformed(shift)), 0.001);
    bool gapRejected = false;
    try { offset_geometry::tightenGeneratedBoundaries(detached.Shape(), source); }
    catch (const std::runtime_error&) { gapRejected = true; }
    require(gapRejected, "Shape budget must not relax edge-to-face agreement");
    // Accepted topology is never adjusted, even within the shape budget.
    BRepBuilderAPI_Copy copy(source, true, false);
    const auto retained = copy.Shape();
    TopTools_IndexedMapOfShape vertices;
    TopExp::MapShapes(retained, TopAbs_VERTEX, vertices);
    const auto vertex = TopoDS::Vertex(vertices(1));
    BRep_Builder().UpdateVertex(vertex, BRep_Tool::Pnt(vertex).Translated(gp_Vec(0.0005, 0, 0)), 0.0005);
    bool rejected = false;
    try { offset_geometry::tightenGeneratedBoundaries(retained, retained); }
    catch (const std::runtime_error&) { rejected = true; }
    require(rejected, "Preserved source vertices cannot be fitted");
}
