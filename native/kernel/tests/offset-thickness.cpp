#include "offset-thickness.h"
#include <BRepAdaptor_Surface.hxx>
#include <BRepPrimAPI_MakeCylinder.hxx>
#include <BRep_Builder.hxx>
#include <TopExp.hxx>
#include <TopoDS.hxx>
#include <TopoDS_Compound.hxx>
#include <sstream>
#include <stdexcept>
#include <iostream>
#include <vector>

namespace {
TopoDS_Face wall(double radius, double z = 0, double x = 0) {
    const auto solid = BRepPrimAPI_MakeCylinder(gp_Ax2(gp_Pnt(x, 0, z), gp_Dir(0, 0, 1)), radius, 10).Shape();
    TopTools_IndexedMapOfShape faces;
    TopExp::MapShapes(solid, TopAbs_FACE, faces);
    for (int i = 1; i <= faces.Extent(); ++i)
        if (BRepAdaptor_Surface(TopoDS::Face(faces(i))).GetType() == GeomAbs_Cylinder) return TopoDS::Face(faces(i));
    throw std::runtime_error("Missing cylindrical face");
}
std::string measure(const std::vector<TopoDS_Face>& walls) {
    BRep_Builder builder;
    TopoDS_Compound body;
    builder.MakeCompound(body);
    for (const auto& face : walls) builder.Add(body, face);
    TopTools_IndexedMapOfShape faces;
    TopExp::MapShapes(body, TopAbs_FACE, faces);
    std::ostringstream output;
    presentOffsetThickness(output, walls.front(), faces, body);
    return output.str();
}
void expect(const std::string& value, const std::string& expected) {
    if (value != ",\"thickness\":" + expected) throw std::runtime_error(value);
}
}
int main() {
    expect(measure({wall(3), wall(8), wall(5)}), "{\"faceIndex\":2,\"distance\":2,\"slope\":-1}");
    expect(measure({wall(8), wall(3), wall(5)}), "{\"faceIndex\":2,\"distance\":3,\"slope\":1}");
    expect(measure({wall(3), wall(8, 20)}), "null");
    expect(measure({wall(3), wall(8), wall(5, 0, 0.2)}), "null");
    // A nearer concentric support without trimmed overlap must not hide a valid one.
    expect(measure({wall(3), wall(5, 20), wall(8)}), "{\"faceIndex\":2,\"distance\":5,\"slope\":-1}");
    std::cout << "Nearest, trimmed overlap and obstructed radial thickness checks passed\n";
}
