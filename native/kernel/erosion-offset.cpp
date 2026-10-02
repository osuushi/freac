#include "erosion.h"
#include "offset-geometry.h"
#include "offset-repair.h"
#include <BRepAlgoAPI_Cut.hxx>
#include <BRepBuilderAPI_Copy.hxx>
#include <BRepBuilderAPI_MakeSolid.hxx>
#include <BRepCheck_Analyzer.hxx>
#include <BRepLib.hxx>
#include <BRepOffsetAPI_MakeOffsetShape.hxx>
#include <BRepClass3d.hxx>
#include <ShapeUpgrade_UnifySameDomain.hxx>
#include <TopExp_Explorer.hxx>
#include <TopoDS.hxx>
#include <TopoDS_Solid.hxx>
#include <TopoDS_Shell.hxx>
#include <stdexcept>

namespace {
TopoDS_Shape cleanValid(const TopoDS_Shape& result) {
    ShapeUpgrade_UnifySameDomain clean(result, true, true, false);
    clean.SetSafeInputMode(true);
    clean.Build();
    // Periodic toroidal faces can be incorrectly merged across distinct trims.
    // Cleanup is optional; retain the precise offset if merging invalidates it.
    return BRepCheck_Analyzer(clean.Shape(), true, false, true).IsValid() ? clean.Shape() : result;
}
TopoDS_Shape offsetSkin(const TopoDS_Shape& source, double inward, bool intersections) {
    const auto copy = BRepBuilderAPI_Copy(source, true, false).Shape();
    BRepOffsetAPI_MakeOffsetShape operation;
    operation.PerformByJoin(copy, -inward, 1e-7,
                            BRepOffset_Skin, intersections, false, GeomAbs_Arc, false);
    if (!operation.IsDone() || operation.Shape().IsNull())
        throw std::runtime_error("Erosion could not construct an eroded body at this thickness");
    const auto result = operation.Shape();
    if (!BRepCheck_Analyzer(result, true, false, true).IsValid())
        BRepLib::SameParameter(result, 1e-7, true);
    try {
        offset_geometry::tightenGeneratedBoundaries(result, source);
    } catch (const std::runtime_error&) {
        // Offset intersections can leave a coarse spatial approximation even
        // when the incident pcurves agree. Rebuild it, then remeasure strictly.
        offset_geometry::rebuildBoundaries(result, source);
        offset_geometry::tightenGeneratedBoundaries(result, source);
    }
    return cleanValid(result);
}
TopoDS_Solid enclosed(const TopoDS_Shell& shell) {
    auto solid = BRepBuilderAPI_MakeSolid(shell).Solid();
    if (!BRepLib::OrientClosedSolid(solid))
        throw std::runtime_error("Erosion could not orient a closed cavity boundary");
    return solid;
}
}

TopoDS_Shape erosion::offset(const TopoDS_Shape& source, double inward, bool intersections) {
    TopExp_Explorer solids(source, TopAbs_SOLID);
    if (!solids.More()) throw std::runtime_error("Erosion needs a closed solid");
    const auto solid = TopoDS::Solid(solids.Current());
    solids.Next();
    if (solids.More()) throw std::runtime_error("Erosion expects one source solid at a time");
    std::vector<TopoDS_Shell> shells;
    for (TopExp_Explorer s(solid, TopAbs_SHELL); s.More(); s.Next()) shells.push_back(TopoDS::Shell(s.Current()));
    if (shells.size() <= 1) return offsetSkin(source, inward, intersections);
    // Inner shells bound existing voids. Shrink the material's outer enclosure,
    // expand every void, then perform one Boolean cut. This permits voids to merge
    // or break through the outer boundary without relying on disconnected offset skins.
    const auto outer = BRepClass3d::OuterShell(solid);
    const auto outside = offsetSkin(enclosed(outer), inward, intersections);
    TopTools_ListOfShape arguments, tools;
    arguments.Append(outside);
    for (const auto& shell : shells)
        if (!shell.IsSame(outer)) tools.Append(offsetSkin(enclosed(shell), -inward, intersections));
    BRepAlgoAPI_Cut cut;
    cut.SetArguments(arguments); cut.SetTools(tools); cut.SetNonDestructive(true); cut.Build();
    if (!cut.IsDone() || cut.HasErrors() || cut.HasWarnings())
        throw std::runtime_error("Erosion could not combine the expanded internal cavities");
    offset_geometry::tightenGeneratedBoundaries(cut.Shape(), source);
    return cleanValid(cut.Shape());
}
