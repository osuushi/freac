#include "erosion.h"
#include "erosion-distance-bounds.h"
#include <BRepAlgoAPI_Fuse.hxx>
#include <BRepBuilderAPI_MakeVertex.hxx>
#include <BRepExtrema_DistShapeShape.hxx>
#include <BRepAlgoAPI_Cut.hxx>
#include <BRepPrimAPI_MakeBox.hxx>
#include <BRepPrimAPI_MakeCylinder.hxx>
#include <BRep_Builder.hxx>
#include <TopoDS_Compound.hxx>
#include <iostream>
#include <stdexcept>

namespace {
TopoDS_Shape empty() {
    TopoDS_Compound result; BRep_Builder().MakeCompound(result); return result;
}
void rejected(const TopoDS_Shape& source, const TopoDS_Shape& candidate, double depth) {
    try { erosion::checkCoverage(source, candidate, depth); }
    catch (const std::runtime_error&) { return; }
    throw std::runtime_error("Accepted missing interior beyond allowance");
}
void distanceBounds() {
    const auto vertical = BRepPrimAPI_MakeCylinder(5, 12).Shape();
    const auto tilted = BRepPrimAPI_MakeCylinder(
        gp_Ax2(gp_Pnt(0, 0, 6), gp_Dir(1, 0.2, 0.1)), 2, 12).Shape();
    const auto shape = BRepAlgoAPI_Fuse(vertical, tilted).Shape();
    erosion::BoundaryDistance bounds(shape);
    for (int x = -2; x <= 5; ++x) for (int y = -2; y <= 2; ++y) {
        const gp_Pnt point(x*2.31, y*1.27, 5.43+x*0.13);
        BRepExtrema_DistShapeShape distance(BRepBuilderAPI_MakeVertex(point).Shape(), erosion::boundary(shape));
        if (!distance.IsDone() || bounds.lower(point) > distance.Value()+1e-6 ||
            bounds.upper(point) < distance.Value()-1e-6)
            throw std::runtime_error("Trimmed curved distance bounds are not conservative");
        std::array<gp_Pnt, 8> corners;
        for (int i = 0; i < 8; ++i) corners[i] = gp_Pnt(
            point.X()+(i&1 ? 0.1 : -0.1), point.Y()+(i&2 ? 0.1 : -0.1), point.Z()+(i&4 ? 0.1 : -0.1));
        const double upper = bounds.upper(corners);
        for (const auto& corner : corners) {
            BRepExtrema_DistShapeShape actual(BRepBuilderAPI_MakeVertex(corner).Shape(), erosion::boundary(shape));
            if (!actual.IsDone() || upper < actual.Value()-1e-6)
                throw std::runtime_error("Curved cell upper bound is not conservative");
        }
    }
}
}
int main() {
    distanceBounds();
    const auto source = BRepPrimAPI_MakeBox(20, 20, 10).Shape();
    const auto exact = BRepPrimAPI_MakeBox(gp_Pnt(1, 1, 1), 18, 18, 8).Shape();
    erosion::checkCoverage(source, exact, 1);
    rejected(source, empty(), 1);
    const auto small = BRepPrimAPI_MakeBox(gp_Pnt(2, 2, 2), 16, 16, 6).Shape();
    rejected(source, small, 1.5);
    erosion::checkCoverage(source, small, 2);
    erosion::checkCoverage(BRepPrimAPI_MakeBox(2, 20, 10).Shape(), empty(), 1.1);
    // A small, off-center omission must not pass merely because coarse samples miss it.
    const auto hole = BRepPrimAPI_MakeBox(gp_Pnt(3.13, 4.27, 2.31), 0.1, 0.1, 0.1).Shape();
    const auto punctured = BRepAlgoAPI_Cut(exact, hole).Shape();
    rejected(source, punctured, 1.2);
    // Curved supports use conservative distance bounds, never their display mesh.
    const auto cylinder = BRepPrimAPI_MakeCylinder(5, 10).Shape();
    const auto inset = BRepPrimAPI_MakeCylinder(gp_Ax2(gp_Pnt(0, 0, 1), gp_Dir(0, 0, 1)), 4, 8).Shape();
    erosion::checkCoverage(cylinder, inset, 1.2);
    rejected(cylinder, empty(), 1.2);
    std::cout << "Exact, allowance, empty, small omitted interior and curved coverage passed\n";
}
