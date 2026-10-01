#include "loft-wire.h"
#include <BRepBuilderAPI_Copy.hxx>
#include <BRepBuilderAPI_MakeEdge.hxx>
#include <BRepBuilderAPI_MakeWire.hxx>
#include <BRepFill_CompatibleWires.hxx>
#include <BRepTools_WireExplorer.hxx>
#include <BRep_Tool.hxx>
#include <Geom_Curve.hxx>
#include <TopTools_SequenceOfShape.hxx>
#include <TopoDS.hxx>
#include <stdexcept>

namespace {
std::vector<TopoDS_Edge> edges(const TopoDS_Wire& wire) {
    std::vector<TopoDS_Edge> result;
    for (BRepTools_WireExplorer e(wire); e.More(); e.Next()) result.push_back(e.Current());
    if (result.empty()) throw std::runtime_error("Loft boundary has no edges");
    return result;
}
TopoDS_Wire prepare(const TopoDS_Wire& source) {
    auto wire = TopoDS::Wire(BRepBuilderAPI_Copy(source).Shape());
    const auto spans = edges(wire);
    if (spans.size() != 1) return wire;
    // A periodic circle/curve gets explicit quarter seams, so alignment remains
    // adjustable even when its original topology contained only one edge.
    double first, last;
    const auto curve = BRep_Tool::Curve(spans[0], first, last);
    if (curve.IsNull() || !curve->IsPeriodic()) return wire;
    BRepBuilderAPI_MakeWire builder;
    for (int i = 0; i < 4; ++i)
        builder.Add(BRepBuilderAPI_MakeEdge(curve, first + (last-first)*i/4, first + (last-first)*(i+1)/4).Edge());
    if (!builder.IsDone()) throw std::runtime_error("Cannot prepare periodic loft boundary");
    return builder.Wire();
}
TopoDS_Wire rotate(const TopoDS_Wire& wire, int step) {
    const auto spans = edges(wire);
    const int count = static_cast<int>(spans.size());
    const int offset = (step % count + count) % count;
    BRepBuilderAPI_MakeWire builder;
    for (int i = 0; i < count; ++i) builder.Add(spans[(i+offset)%count]);
    if (!builder.IsDone()) throw std::runtime_error("Cannot align loft boundary");
    return builder.Wire();
}
}
std::vector<TopoDS_Wire> compatibleLoftWires(const std::vector<TopoDS_Wire>& input,
                                           const std::vector<int>& alignment) {
    TopTools_SequenceOfShape sections;
    for (const auto& wire : input) sections.Append(prepare(wire));
    BRepFill_CompatibleWires compatible(sections);
    compatible.Perform();
    if (!compatible.IsDone()) throw std::runtime_error("Cannot establish loft boundary correspondence");
    std::vector<TopoDS_Wire> result;
    for (int i = 1; i <= compatible.Shape().Length(); ++i)
        result.push_back(rotate(TopoDS::Wire(compatible.Shape().Value(i)), alignment.empty() ? 0 : alignment[i-1]));
    return result;
}
