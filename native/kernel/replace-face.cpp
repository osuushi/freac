#include "kernel.h"
#include "boundary-move.h"
#include "boundary-validation.h"
#include <BRepAdaptor_Curve.hxx>
#include <BRepAdaptor_Surface.hxx>
#include <BRepBuilderAPI_Copy.hxx>
#include <BRepBuilderAPI_MakeEdge.hxx>
#include <BRepBuilderAPI_MakeFace.hxx>
#include <BRep_Tool.hxx>
#include <Geom_ConicalSurface.hxx>
#include <Geom_CylindricalSurface.hxx>
#include <gp_Lin.hxx>
#include <algorithm>

namespace {
using boundary_move::require;
int outward(const TopoDS_Face& face) {
    const BRepAdaptor_Surface s(face);
    const bool direct = s.GetType() == GeomAbs_Cone ? s.Cone().Direct() : s.Cylinder().Direct();
    return (face.Orientation() == TopAbs_REVERSED ? -1 : 1) * (direct ? 1 : -1);
}
struct Surface {
    gp_Pnt origin;
    gp_Dir axis;
    double radius, slope;
    double height(const gp_Pnt& p) const { return gp_Vec(origin, p).Dot(gp_Vec(axis)); }
    double at(double height) const { return radius + slope * height; }
    gp_Pnt moved(const gp_Pnt& p) const {
        const double t = height(p);
        const auto center = origin.Translated(gp_Vec(axis) * t);
        return center.Translated(gp_Vec(center, p).Normalized() * at(t));
    }
};
Surface support(const Tree& input) {
    const auto& s = input.get_child("surface");
    const auto origin = point(s.get_child("origin"));
    const gp_Vec axis(point(s.get_child("axis")).XYZ());
    require(std::abs(axis.Magnitude() - 1) < 1e-7, "Surface axis must be a unit vector");
    const auto kind = s.get<std::string>("kind");
    require(kind == "cylinder" || kind == "cone", "Replacement support must be cylinder or cone");
    const double radius = s.get<double>("radius");
    const double angle = kind == "cone" ? s.get<double>("semiAngle") : 0;
    require(std::isfinite(radius) && radius > 1e-7 && std::isfinite(angle) && std::abs(angle) < 89,
            "Surface requires positive radius and a finite semi-angle within (-89, 89) degrees");
    return {origin, gp_Dir(axis), radius, std::tan(angle * std::acos(-1) / 180)};
}
struct Wall {
    TopoDS_Face face;
    TopTools_IndexedMapOfShape edges;
    std::vector<TopoDS_Edge> rims;
    TopoDS_Edge seam;
};
Wall wall(const Operand& body, const std::string& id, const Surface& surface) {
    Wall w;
    for (const auto& e : body.entities)
        if (e.id == id && e.shape.ShapeType() == TopAbs_FACE) w.face = TopoDS::Face(e.shape);
    require(!w.face.IsNull(), "Unknown replacement face");
    BRepAdaptor_Surface s(w.face);
    require(s.GetType() == GeomAbs_Cylinder || s.GetType() == GeomAbs_Cone,
            "Replace face currently requires a complete cylindrical or conical wall");
    const auto axis = s.GetType() == GeomAbs_Cylinder ? s.Cylinder().Axis() : s.Cone().Axis();
    require(axis.Direction().IsParallel(surface.axis, 1e-8) &&
            gp_Lin(axis).Distance(surface.origin) < 1e-7, "Replacement surface must be coaxial with the wall");
    TopExp::MapShapes(w.face, TopAbs_EDGE, w.edges);
    for (int i = 1; i <= w.edges.Extent(); ++i) {
        const auto edge = TopoDS::Edge(w.edges(i));
        BRepAdaptor_Curve curve(edge);
        if (BRep_Tool::IsClosed(edge, w.face)) {
            require(w.seam.IsNull() && curve.GetType() == GeomAbs_Line, "Unsupported wall seam");
            w.seam = edge;
        } else {
            require(curve.GetType() == GeomAbs_Circle && BRep_Tool::IsClosed(edge),
                    "Replacement requires two complete circular rims; partial or pierced walls are unsupported");
            w.rims.push_back(edge);
        }
    }
    require(w.rims.size() == 2 && !w.seam.IsNull(), "Replacement requires two circular rims and one seam");
    for (const auto& rim : w.rims) {
        int neighbors = 0;
        for (const auto& face : boundary_move::faces(body.shape)) {
            if (face.IsSame(w.face)) continue;
            TopTools_IndexedMapOfShape edges; TopExp::MapShapes(face, TopAbs_EDGE, edges);
            if (!edges.Contains(rim)) continue;
            const BRepAdaptor_Surface neighbor(face);
            require(neighbor.GetType() == GeomAbs_Plane &&
                    neighbor.Plane().Axis().Direction().IsParallel(surface.axis, 1e-8),
                    "Replacement requires planar neighbors perpendicular to its axis");
            ++neighbors;
        }
        require(neighbors == 1, "Wall rim must have exactly one neighboring face");
    }
    return w;
}
TopoDS_Face replacement(const Wall& w, const Surface& s) {
    double a = s.height(BRepAdaptor_Curve(w.rims[0]).Circle().Location());
    double b = s.height(BRepAdaptor_Curve(w.rims[1]).Circle().Location());
    if (a > b) std::swap(a, b);
    require(b-a > 1e-7 && std::min(s.at(a), s.at(b)) > 1e-7,
            "Replacement collapses a rim or crosses the cone apex");
    BRepAdaptor_Curve seam(w.seam);
    const auto p = seam.Value(seam.FirstParameter());
    const auto center = s.origin.Translated(gp_Vec(s.axis) * s.height(p));
    const gp_Ax3 frame(s.origin, s.axis, gp_Dir(gp_Vec(center, p)));
    Handle(Geom_Surface) surface;
    const double angle = std::atan(s.slope);
    if (std::abs(angle) < 1e-14) surface = new Geom_CylindricalSurface(frame, s.radius);
    else surface = new Geom_ConicalSurface(frame, angle, s.radius);
    BRepBuilderAPI_MakeFace maker(surface, 0, 2*std::acos(-1), a/std::cos(angle), b/std::cos(angle), 1e-7);
    require(maker.IsDone(), "Cannot construct replacement support");
    return maker.Face();
}
Result replace(const Operand& body, const Tree& input) {
    const auto s = support(input);
    const auto w = wall(body, input.get<std::string>("face"), s);
    if (std::all_of(w.rims.begin(), w.rims.end(), [&](const auto& rim) {
        const auto circle = BRepAdaptor_Curve(rim).Circle();
        return std::abs(circle.Radius() - s.at(s.height(circle.Location()))) <= 1e-12;
    })) return {body.shape, body.entities, {body.id}, {}};
    const auto face = replacement(w, s);
    boundary_move::Edit edit;
    edit.body = &body;
    TopExp::MapShapes(body.shape, TopAbs_EDGE, edit.sourceEdges);
    TopExp::MapShapes(w.face, TopAbs_VERTEX, edit.movedVertices);
    for (int i = 1; i <= edit.sourceEdges.Extent(); ++i) {
        const auto edge = TopoDS::Edge(edit.sourceEdges(i));
        if (!w.edges.Contains(edge)) {
            edit.edges.push_back(TopoDS::Edge(BRepBuilderAPI_Copy(edge).Shape()));
            continue;
        }
        BRepAdaptor_Curve curve(edge);
        if (edge.IsSame(w.seam)) {
            edit.edges.push_back(BRepBuilderAPI_MakeEdge(s.moved(curve.Value(curve.FirstParameter())),
                s.moved(curve.Value(curve.LastParameter()))).Edge());
        } else {
            auto circle = curve.Circle();
            circle.SetRadius(s.at(s.height(circle.Location())));
            edit.edges.push_back(BRepBuilderAPI_MakeEdge(circle).Edge());
        }
    }
    auto result = boundary_move::reconstruct(edit, {{input.get<std::string>("face"), face}});
    const auto key = input.get<std::string>("face");
    const auto mapped = std::find_if(result.predecessors.begin(), result.predecessors.end(),
        [&](const auto& e) { return e.id == key; });
    require(mapped != result.predecessors.end(), "Replacement lost face correspondence");
    for (const auto& f : boundary_move::faces(result.shape)) if (f.IsSame(mapped->shape))
        require(outward(f) == outward(w.face), "Replacement inverted the material orientation");
    return result;
}
}
std::vector<Result> replaceFace(const Tree& input, const std::vector<Operand>& bodies,
                                std::vector<std::string>& participants) {
    const auto id = input.get<std::string>("body");
    const auto body = std::find_if(bodies.begin(), bodies.end(), [&](const auto& b) { return b.id == id; });
    require(body != bodies.end(), "Unknown replacement body");
    auto result = replace(*body, input);
    if (result.shape.IsSame(body->shape)) return {};
    participants.push_back(id);
    return {result};
}
