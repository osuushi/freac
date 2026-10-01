#include "kernel.h"
#include <BRep_Builder.hxx>
#include <BRep_Tool.hxx>
#include <Geom_TrimmedCurve.hxx>
#include <HLRAlgo_Projector.hxx>
#include <HLRBRep_Algo.hxx>
#include <HLRBRep_HLRToShape.hxx>
#include <TopExp_Explorer.hxx>
#include <TopoDS.hxx>
#include <TopoDS_Compound.hxx>
#include <TopoDS_Edge.hxx>
#include <gp_Ax2.hxx>
#include <stdexcept>

// Exact apparent contours supply boundaries that are not stored topology edges.
// Keep 3D curves so the usual projection/analytic/cubic conversion owns the output.
std::vector<Handle(Geom_Curve)> projectionContours(const Tree& input, const std::vector<Operand>& bodies) {
    std::vector<Handle(Geom_Curve)> curves;
    const auto requested = input.get_child_optional("contours");
    if (!requested) return curves;
    const auto& frame = input.get_child("frame");
    const gp_Vec u(point(frame.get_child("u")).XYZ()), v(point(frame.get_child("v")).XYZ());
    const HLRAlgo_Projector projector(gp_Ax2(point(frame.get_child("origin")), gp_Dir(u.Crossed(v)), gp_Dir(u)));
    for (const auto& body : bodies) {
        bool whole = false;
        TopoDS_Compound faces;
        BRep_Builder builder;
        builder.MakeCompound(faces);
        bool found = false;
        for (const auto& item : *requested) {
            if (item.second.get<std::string>("body") != body.id) continue;
            found = true;
            if (item.second.get<std::string>("kind") == "body") { whole = true; break; }
            bool added = false;
            for (const auto& entity : body.entities)
                if (entity.id == item.second.get<std::string>("face") && entity.shape.ShapeType() == TopAbs_FACE) {
                    builder.Add(faces, entity.shape); added = true;
                }
            if (!added) throw std::runtime_error("Projection source face no longer exists");
        }
        if (!found) continue;
        Handle(HLRBRep_Algo) algorithm = new HLRBRep_Algo();
        algorithm->Add(whole ? body.shape : faces);
        algorithm->Projector(projector);
        algorithm->Update();
        algorithm->Hide();
        HLRBRep_HLRToShape result(algorithm);
        for (const bool visible : {true, false}) {
            const auto contour = result.CompoundOfEdges(HLRBRep_OutLine, visible, true);
            for (TopExp_Explorer edges(contour, TopAbs_EDGE); edges.More(); edges.Next()) {
                const auto edge = TopoDS::Edge(edges.Current());
                if (BRep_Tool::Degenerated(edge)) continue;
                double first, last;
                const auto curve = BRep_Tool::Curve(edge, first, last);
                if (curve.IsNull()) throw std::runtime_error("Apparent contour has no spatial curve");
                curves.push_back(new Geom_TrimmedCurve(curve, first, last));
            }
        }
    }
    return curves;
}
