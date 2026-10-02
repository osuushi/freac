#include "erosion.h"
#include "offset-geometry.h"
#include <BRepAlgoAPI_Cut.hxx>
#include <BRepExtrema_DistShapeShape.hxx>
#include <TopExp.hxx>
#include <TopExp_Explorer.hxx>
#include <TopTools_IndexedMapOfShape.hxx>
#include <stdexcept>

void erosion::validateCavity(const TopoDS_Shape& source, const TopoDS_Shape& candidate,
                              double thickness, double allowance) {
    TopTools_IndexedMapOfShape allFaces, solidFaces;
    TopExp::MapShapes(candidate, TopAbs_FACE, allFaces);
    for (TopExp_Explorer s(candidate, TopAbs_SOLID); s.More(); s.Next()) {
        offset_geometry::validSolid(s.Current(), "Erosion");
        TopExp::MapShapes(s.Current(), TopAbs_FACE, solidFaces);
    }
    if (allFaces.Extent() != solidFaces.Extent())
        throw std::runtime_error("Erosion left an open or unowned surface");
    if (solidFaces.Extent()) {
        BRepAlgoAPI_Cut outside;
        TopTools_ListOfShape arguments, tools;
        arguments.Append(candidate); tools.Append(source);
        outside.SetArguments(arguments); outside.SetTools(tools);
        outside.SetNonDestructive(true); outside.Build();
        if (!outside.IsDone() || outside.HasErrors() || outside.HasWarnings() ||
            volume(outside.Shape()) > 1e-9)
            throw std::runtime_error("Erosion must stay inside the original body");
        BRepExtrema_DistShapeShape gap(boundary(source), boundary(candidate));
        if (!gap.IsDone() || gap.Value() < thickness - geometry_policy::boundaryDistanceMm)
            throw std::runtime_error("Erosion would violate the minimum wall thickness");
    }
    checkCoverage(source, candidate, thickness + allowance);
}
