#include "screw-sweep.h"
#include <BRepAdaptor_Surface.hxx>
#include <BRepBuilderAPI_MakeEdge.hxx>
#include <BRepBuilderAPI_MakeWire.hxx>
#include <BRepLib.hxx>
#include <BRepOffsetAPI_MakePipeShell.hxx>
#include <BRepTools.hxx>
#include <Geom_BezierCurve.hxx>
#include <TColgp_Array1OfPnt.hxx>
#include <TopExp.hxx>
#include <TopExp_Explorer.hxx>
#include <TopoDS.hxx>
#include <TopoDS_Solid.hxx>
#include <cmath>
#include <stdexcept>

namespace {
struct Path { TopoDS_Wire wire; gp_Pnt start; gp_Vec tangent; };
void checkJoin(const gp_Pnt& previous, const gp_Pnt& next, const gp_Vec& incoming, const gp_Vec& outgoing) {
    if (previous.Distance(next) > 1e-7) throw std::runtime_error("Sweep path segments must be connected in order");
    if (incoming.Normalized().Dot(outgoing.Normalized()) < 1 - 1e-7)
        throw std::runtime_error("Sweep path joins must be tangent-continuous; round sharp corners explicitly");
}
Path makePath(const Tree& input) {
    BRepBuilderAPI_MakeWire builder;
    const auto& segments = input.get_child("path");
    if (segments.empty() || segments.size() > 256) throw std::runtime_error("Sweep needs 1-256 path segments");
    gp_Pnt first, previous; gp_Vec initial, incoming;
    size_t count = 0;
    for (const auto& item : segments) {
        const auto& segment = item.second;
        const auto a = point(segment.get_child("a")), b = point(segment.get_child("b"));
        const auto kind = segment.get<std::string>("kind");
        gp_Vec outgoing(a, b), endTangent(a, b);
        TopoDS_Edge edge;
        if (kind == "line") {
            if (outgoing.Magnitude() < 1e-7) throw std::runtime_error("Sweep path has a zero-length line");
            edge = BRepBuilderAPI_MakeEdge(a, b).Edge();
        } else if (kind == "bezier") {
            const auto c1 = point(segment.get_child("c1")), c2 = point(segment.get_child("c2"));
            outgoing = gp_Vec(a, c1); endTangent = gp_Vec(c2, b);
            if (outgoing.Magnitude() < 1e-7 || endTangent.Magnitude() < 1e-7)
                throw std::runtime_error("Sweep Bézier endpoints need nonzero tangents");
            TColgp_Array1OfPnt poles(1, 4); poles(1)=a; poles(2)=c1; poles(3)=c2; poles(4)=b;
            Handle(Geom_BezierCurve) curve = new Geom_BezierCurve(poles);
            edge = BRepBuilderAPI_MakeEdge(curve).Edge();
        } else throw std::runtime_error("Unknown sweep path segment");
        if (count++) checkJoin(previous, a, incoming, outgoing);
        else { first = a; initial = outgoing; }
        previous = b; incoming = endTangent;
        builder.Add(edge);
        if (!builder.IsDone()) throw std::runtime_error("Cannot connect sweep path");
    }
    if (first.Distance(previous) < 1e-7) checkJoin(previous, first, incoming, initial);
    return {builder.Wire(), first, initial};
}
TopoDS_Shape sweepBoundary(const TopoDS_Wire& section, const Path& path) {
    BRepOffsetAPI_MakePipeShell pipe(path.wire);
    // OCCT's corrected-Frenet frame reduces twist without a saved guide object.
    pipe.SetMode(false);
    pipe.SetTolerance(1e-7, 1e-7, 1e-7);
    pipe.SetMaxDegree(14); pipe.SetMaxSegments(1000);
    TopoDS_Vertex start, end; TopExp::Vertices(path.wire, start, end);
    pipe.Add(section, start, false, false);
    pipe.Build();
    if (!pipe.IsDone() || !pipe.MakeSolid()) throw std::runtime_error("Cannot form a closed solid along this path");
    auto result = pipe.Shape();
    if (result.ShapeType() == TopAbs_SOLID) {
        auto solid = TopoDS::Solid(result);
        if (!BRepLib::OrientClosedSolid(solid)) throw std::runtime_error("Cannot orient swept solid");
        result = solid;
    }
    validateSweptSolids(result);
    return result;
}
TopoDS_Shape sweepSection(const TopoDS_Face& face, const Path& path) {
    BRepAdaptor_Surface surface(face);
    if (surface.GetType() != GeomAbs_Plane) throw std::runtime_error("Sweep needs a planar section");
    const auto plane = surface.Plane();
    if (plane.Distance(path.start) > 1e-7 ||
        std::abs(gp_Vec(plane.Axis().Direction()).Dot(path.tangent.Normalized())) < 1 - 1e-7)
        throw std::runtime_error("Sweep must start in the section plane, perpendicular to it");
    const auto outer = BRepTools::OuterWire(face);
    auto result = sweepBoundary(outer, path);
    for (TopExp_Explorer e(face, TopAbs_WIRE); e.More(); e.Next()) {
        if (e.Current().IsSame(outer)) continue;
        const auto hole = sweepBoundary(TopoDS::Wire(e.Current()), path);
        std::vector<SourceEntity> unused; result = booleanShape(result, hole, "subtract", unused);
    }
    validateSweptSolids(result);
    return result;
}
}
TopoDS_Shape pathSweep(const Tree& input, const std::vector<Operand>& bodies) {
    const auto path = makePath(input);
    TopoDS_Shape result;
    for (const auto& item : input.get_child("profiles")) {
        const auto shape = sweepSection(profileFace(item.second, bodies), path);
        if (result.IsNull()) result = shape;
        else { std::vector<SourceEntity> unused; result = booleanShape(result, shape, "union", unused); }
    }
    validateSweptSolids(result);
    return result;
}
