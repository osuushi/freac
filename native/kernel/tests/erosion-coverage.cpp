#include "erosion.h"
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
}
int main() {
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
