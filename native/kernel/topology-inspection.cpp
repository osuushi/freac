#include "kernel.h"
#include <BRepAdaptor_Curve.hxx>
#include <BRepAdaptor_Surface.hxx>
#include <BRepBndLib.hxx>
#include <BRepGProp.hxx>
#include <BRepTools.hxx>
#include <BRepTools_WireExplorer.hxx>
#include <BRep_Tool.hxx>
#include <Bnd_Box.hxx>
#include <GProp_GProps.hxx>
#include <TopExp.hxx>
#include <TopExp_Explorer.hxx>
#include <TopTools_IndexedMapOfShape.hxx>
#include <TopoDS.hxx>
#include <TopoDS_Wire.hxx>
#include <gp_Cone.hxx>
#include <gp_Cylinder.hxx>
#include <gp_Pln.hxx>
#include <algorithm>

namespace {
void xyz(std::ostream& out, const gp_XYZ& p) { out << '[' << p.X() << ',' << p.Y() << ',' << p.Z() << ']'; }
std::string id(const Operand& body, const TopoDS_Shape& shape) {
    for (const auto& e : body.entities) if (e.shape.IsSame(shape)) return e.id;
    throw std::runtime_error("Missing topology identity");
}
void surface(std::ostream& out, const TopoDS_Face& face) {
    BRepAdaptor_Surface s(face);
    if (s.GetType() == GeomAbs_Cylinder || s.GetType() == GeomAbs_Cone) {
        const bool cone = s.GetType() == GeomAbs_Cone;
        const auto frame = cone ? s.Cone().Position() : s.Cylinder().Position();
        out << "{\"kind\":" << quoted(cone ? "cone" : "cylinder") << ",\"origin\":";
        xyz(out, frame.Location().XYZ()); out << ",\"axis\":"; xyz(out, frame.Direction().XYZ());
        out << ",\"radius\":" << (cone ? s.Cone().RefRadius() : s.Cylinder().Radius());
        out << ",\"outward\":" << ((face.Orientation() == TopAbs_REVERSED ? -1 : 1) *
            ((cone ? s.Cone().Direct() : s.Cylinder().Direct()) ? 1 : -1));
        if (cone) out << ",\"semiAngle\":" << s.Cone().SemiAngle()*180/std::acos(-1);
        out << '}';
    } else if (s.GetType() == GeomAbs_Plane) {
        const auto frame = s.Plane().Position();
        out << "{\"kind\":\"plane\",\"origin\":"; xyz(out, frame.Location().XYZ());
        out << ",\"u\":"; xyz(out, frame.XDirection().XYZ());
        out << ",\"v\":"; xyz(out, frame.YDirection().XYZ()); out << '}';
    } else out << "{\"kind\":\"other\"}";
}
void face(std::ostream& out, const Operand& body, TopoDS_Face f) {
    out << "{\"id\":" << quoted(id(body, f)) << ",\"reversed\":"
        << (f.Orientation() == TopAbs_REVERSED ? "true" : "false") << ",\"surface\":";
    surface(out, f);
    GProp_GProps props; BRepGProp::SurfaceProperties(f, props);
    out << ",\"area\":" << props.Mass();
    Bnd_Box bounds; BRepBndLib::AddOptimal(f, bounds, false, false);
    double lo[3], hi[3]; bounds.Get(lo[0],lo[1],lo[2],hi[0],hi[1],hi[2]);
    out << ",\"bounds\":[" << lo[0] << ',' << lo[1] << ',' << lo[2] << ','
        << hi[0] << ',' << hi[1] << ',' << hi[2] << "],\"loops\":[";
    f.Orientation(TopAbs_FORWARD);
    const auto outer = BRepTools::OuterWire(f);
    bool comma = false;
    for (TopExp_Explorer wires(f, TopAbs_WIRE); wires.More(); wires.Next()) {
        if (comma) out << ','; comma = true;
        out << "{\"outer\":" << (wires.Current().IsSame(outer) ? "true" : "false") << ",\"edges\":[";
        bool separator = false;
        for (BRepTools_WireExplorer edges(TopoDS::Wire(wires.Current()), f); edges.More(); edges.Next()) {
            if (separator) out << ','; separator = true;
            const auto edge = edges.Current();
            out << "{\"edge\":" << quoted(id(body, edge)) << ",\"reversed\":"
                << (edge.Orientation() == TopAbs_REVERSED ? "true" : "false")
                << ",\"seam\":" << (BRep_Tool::IsClosed(edge, f) ? "true" : "false") << '}';
        }
        out << "]}";
    }
    out << "]}";
}
void edge(std::ostream& out, const Operand& body, const TopoDS_Edge& e) {
    out << "{\"id\":" << quoted(id(body, e)) << ",\"faces\":[";
    bool comma = false;
    for (const auto& source : body.entities) {
        if (source.shape.ShapeType() != TopAbs_FACE) continue;
        TopTools_IndexedMapOfShape edges; TopExp::MapShapes(source.shape, TopAbs_EDGE, edges);
        if (!edges.Contains(e)) continue;
        if (comma) out << ','; comma = true;
        out << quoted(source.id);
    }
    out << "],\"curve\":";
    if (BRep_Tool::Degenerated(e)) { out << "{\"kind\":\"other\"}}"; return; }
    BRepAdaptor_Curve c(e);
    if (c.GetType() == GeomAbs_Circle) {
        const auto circle = c.Circle();
        out << "{\"kind\":\"circle\",\"center\":"; xyz(out, circle.Location().XYZ());
        out << ",\"normal\":"; xyz(out, circle.Axis().Direction().XYZ());
        out << ",\"xAxis\":"; xyz(out, circle.XAxis().Direction().XYZ());
        out << ",\"radius\":" << circle.Radius() << ",\"start\":" << c.FirstParameter()
            << ",\"end\":" << c.LastParameter() << '}';
    } else if (c.GetType() == GeomAbs_Line) {
        out << "{\"kind\":\"line\",\"a\":"; xyz(out, c.Value(c.FirstParameter()).XYZ());
        out << ",\"b\":"; xyz(out, c.Value(c.LastParameter()).XYZ()); out << '}';
    } else out << "{\"kind\":\"other\"}";
    out << '}';
}
}
void inspectTopology(std::ostream& out, const Tree& input, const std::vector<Operand>& bodies) {
    const auto key = input.get<std::string>("body");
    const auto found = std::find_if(bodies.begin(), bodies.end(), [&](const auto& b) { return b.id == key; });
    if (found == bodies.end()) throw std::runtime_error("Unknown topology body");
    const auto& body = *found;
    out << "{\"topology\":{\"body\":" << quoted(body.id) << ",\"units\":\"mm\",\"faces\":[";
    bool comma = false;
    for (const auto& e : body.entities) if (e.shape.ShapeType() == TopAbs_FACE) {
        if (comma) out << ','; comma = true; face(out, body, TopoDS::Face(e.shape));
    }
    out << "],\"edges\":["; comma = false;
    for (const auto& e : body.entities) if (e.shape.ShapeType() == TopAbs_EDGE) {
        if (comma) out << ','; comma = true; edge(out, body, TopoDS::Edge(e.shape));
    }
    out << "]}}";
}
