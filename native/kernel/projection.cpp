#include "kernel.h"
#include "sketch-curve.h"
#include "geometry-policy.h"
#include <BRep_Tool.hxx>
#include <BRepAlgoAPI_Common.hxx>
#include <BRepBuilderAPI_MakeFace.hxx>
#include <TopExp.hxx>
#include <TopExp_Explorer.hxx>
#include <TopTools_IndexedMapOfShape.hxx>
#include <GC_MakeArcOfCircle.hxx>
#include <GeomAdaptor_Curve.hxx>
#include <GeomProjLib.hxx>
#include <GeomConvert_ApproxCurve.hxx>
#include <GeomConvert_BSplineCurveToBezierCurve.hxx>
#include <Geom_BezierCurve.hxx>
#include <Geom_BSplineCurve.hxx>
#include <Geom_Circle.hxx>
#include <Geom_Line.hxx>
#include <Geom_Plane.hxx>
#include <Geom_TrimmedCurve.hxx>
#include <TColgp_Array1OfPnt.hxx>
#include <TopoDS.hxx>
#include <TopoDS_Edge.hxx>
#include <TopoDS_Vertex.hxx>
#include <gp_Pln.hxx>
#include <gp_Circ.hxx>
#include <algorithm>
#include <cmath>
#include <iomanip>
#include <stdexcept>

namespace {
using namespace geometry_policy;

struct Output {
    std::ostream& out;
    gp_Pnt origin; gp_Vec u, v;
    bool first = true;
    void begin(const char* kind) {
        if (!first) out << ','; first = false;
        out << "{\"id\":\"projected\",\"construction\":false,\"kind\":" << quoted(kind);
    }
    void point2(const char* name, const gp_Pnt& p) {
        const gp_Vec d(origin,p);
        out << ',' << quoted(name) << ":{\"x\":" << d.Dot(u) << ",\"y\":" << d.Dot(v) << '}';
    }
    void cubic(const Handle(Geom_BezierCurve)& c) {
        if (c->IsRational() || c->Degree() > 3) throw std::runtime_error("Projection could not produce polynomial cubics");
        c->Increase(3); begin("bezier");
        point2("a",c->Pole(1)); point2("c1",c->Pole(2)); point2("c2",c->Pole(3)); point2("b",c->Pole(4)); out << '}';
    }
};
gp_Pnt onPlane(const gp_Pnt& p, const Handle(Geom_Plane)& plane, const gp_Dir& direction) {
    const auto n=plane->Pln().Axis().Direction();
    return p.Translated(gp_Vec(direction)*(-gp_Vec(plane->Location(),p).Dot(gp_Vec(n))/direction.Dot(n)));
}
bool linearImage(Output& output, const Handle(Geom_Curve)& source, const Handle(Geom_Plane)& plane,
                 const gp_Dir& direction, bool skipCollapsed) {
    GeomAdaptor_Curve curve(source);
    const double first=curve.FirstParameter(), last=curve.LastParameter();
    auto a=onPlane(curve.Value(first),plane,direction), b=onPlane(curve.Value(last),plane,direction);
    if (curve.GetType()==GeomAbs_Circle && std::abs(curve.Circle().Axis().Direction().Dot(direction))<edgeOnDirectionDot) {
        const auto circle=curve.Circle(); const auto center=onPlane(circle.Location(),plane,direction);
        const gp_Vec u(center,onPlane(circle.Location().Translated(gp_Vec(circle.XAxis().Direction())*circle.Radius()),plane,direction));
        const gp_Vec v(center,onPlane(circle.Location().Translated(gp_Vec(circle.YAxis().Direction())*circle.Radius()),plane,direction));
        const gp_Dir along(u.SquareMagnitude()>v.SquareMagnitude() ? u:v);
        const double phase=std::atan2(v.Dot(gp_Vec(along)),u.Dot(gp_Vec(along))), pi=std::acos(-1.0);
        double low=gp_Vec(center,a).Dot(gp_Vec(along)), high=gp_Vec(center,b).Dot(gp_Vec(along));
        if(low>high) std::swap(low,high);
        for(int k=int(std::ceil((first-phase)/pi)); phase+k*pi<=last; ++k) {
            const auto p=onPlane(curve.Value(phase+k*pi),plane,direction);
            const double t=gp_Vec(center,p).Dot(gp_Vec(along)); low=std::min(low,t); high=std::max(high,t);
        }
        a=center.Translated(gp_Vec(along)*low); b=center.Translated(gp_Vec(along)*high);
    } else if(curve.GetType()!=GeomAbs_Line) return false;
    if(a.Distance(b)<projectionCollapsedLengthMm) {
        if (skipCollapsed) return true;
        throw std::runtime_error("Selected edge projects to a point");
    }
    output.begin("segment"); output.point2("a",a); output.point2("b",b); output.out << '}'; return true;
}
struct Endpoints { gp_Pnt a, b; };
void projectCurve(Output& output, const Handle(Geom_Curve)& source, const Handle(Geom_Plane)& plane,
                  const gp_Dir& direction, const Endpoints* joined = nullptr, bool skipCollapsed = false) {
    if (!joined && linearImage(output,source,plane,direction,skipCollapsed)) return;
    const auto projected = GeomProjLib::ProjectOnPlane(source, plane, direction, true);
    if (projected.IsNull()) throw std::runtime_error("Curve projection failed");
    const double first=projected->FirstParameter(), last=projected->LastParameter();
    GeomAdaptor_Curve curve(projected);
    const auto a = joined ? joined->a : curve.Value(first);
    const auto b = joined ? joined->b : curve.Value(last);
    const double correction = std::max(a.Distance(curve.Value(first)), b.Distance(curve.Value(last)));
    if (correction > projectionEndpointMm) throw std::runtime_error("Cross section endpoint tolerance exceeded");
    if (curve.GetType() == GeomAbs_Line) {
        if (a.Distance(b)<projectionCollapsedLengthMm) throw std::runtime_error("Selected edge projects to a point");
        output.begin("segment"); output.point2("a",a); output.point2("b",b); output.out << '}'; return;
    }
    if (curve.GetType() == GeomAbs_Circle) {
        const auto circle=curve.Circle(); const double sweep=last-first;
        if (sweep >= 2*std::acos(-1.0)-fullCircleAngleRad) {
            output.begin("circle"); output.point2("center",circle.Location()); output.out << ",\"radius\":" << circle.Radius() << '}';
        } else {
            const double sign=circle.Axis().Direction().Dot(plane->Pln().Axis().Direction())>0 ? 1 : -1;
            const double bulge = std::tan(sign*sweep/4);
            // Bound the center/radius change caused by joining analytic arc endpoints.
            const double amplification = 1 + std::abs((1-bulge*bulge)/(2*bulge))
                + std::abs((1+bulge*bulge)/(2*bulge));
            if (correction*amplification > projectionBudgetMm) throw std::runtime_error("Cross section arc tolerance exceeded");
            output.begin("arc"); output.point2("a",a); output.point2("b",b);
            output.out << ",\"bulge\":" << bulge << '}';
        }
        return;
    }
    if (curve.GetType() == GeomAbs_BezierCurve && !curve.Bezier()->IsRational() && curve.Bezier()->Degree()<=3) {
        auto part=Handle(Geom_BezierCurve)::DownCast(curve.Bezier()->Copy()); part->Segment(first,last);
        part->SetPole(1,a); part->SetPole(part->NbPoles(),b); output.cubic(part); return;
    }
    // Half the 0.001 mm budget is reserved for endpoint correction. Failure is explicit.
    GeomConvert_ApproxCurve approximate(projected, projectionFitMm, GeomAbs_C1, 256, 3);
    if (!approximate.IsDone() || !approximate.HasResult() || approximate.MaxError()>projectionFitMm)
        throw std::runtime_error("Projection exceeds the 0.001 mm approximation tolerance");
    GeomConvert_BSplineCurveToBezierCurve pieces(approximate.Curve());
    for (int i=1; i<=pieces.NbArcs(); ++i) {
        auto piece=pieces.Arc(i);
        if (i==1) {
            if (piece->StartPoint().Distance(a)>projectionEndpointMm) throw std::runtime_error("Projection endpoint tolerance exceeded");
            piece->SetPole(1,a);
        }
        if (i==pieces.NbArcs()) {
            if (piece->EndPoint().Distance(b)>projectionEndpointMm) throw std::runtime_error("Projection endpoint tolerance exceeded");
            piece->SetPole(piece->NbPoles(),b);
        }
        output.cubic(piece);
    }
}
}
void projectCurves(std::ostream& out, const Tree& input, const std::vector<Operand>& bodies) {
    const auto& frame=input.get_child("frame");
    const auto origin=point(frame.get_child("origin")), u=point(frame.get_child("u")), v=point(frame.get_child("v"));
    const gp_Vec U(u.XYZ()), V(v.XYZ());
    Handle(Geom_Plane) plane=new Geom_Plane(gp_Ax3(origin,gp_Dir(U.Crossed(V)),gp_Dir(U)));
    const auto selectedDirection=input.get_child_optional("direction");
    const gp_Dir direction=selectedDirection ? gp_Dir(point(*selectedDirection).XYZ()) : plane->Pln().Axis().Direction();
    if (std::abs(direction.Dot(plane->Pln().Axis().Direction()))<edgeOnDirectionDot)
        throw std::runtime_error("Projection direction is parallel to target plane");
    const auto contours = projectionContours(input,bodies);
    std::vector<gp_Pnt> junctions;
    for (const auto& curve : contours) {
        junctions.push_back(curve->Value(curve->FirstParameter()));
        junctions.push_back(curve->Value(curve->LastParameter()));
    }
    out << std::setprecision(17) << "{\"curves\":["; Output output{out,origin,U,V};
    const auto projectJoined = [&](const Handle(Geom_Curve)& curve, bool implicit) {
        // Linear/edge-on images use their extrema, rather than a closed rim's ends.
        if (linearImage(output,curve,plane,direction,implicit)) return;
        for (const auto& span : projectionSpans(curve,junctions)) {
            const Endpoints joined{
                onPlane(span->Value(span->FirstParameter()),plane,direction),
                onPlane(span->Value(span->LastParameter()),plane,direction)};
            projectCurve(output,span,plane,direction,&joined,implicit);
        }
    };
    for (const auto& item:input.get_child("edges")) {
        bool found=false;
        for (const auto& body:bodies) if (body.id==item.second.get<std::string>("body"))
            for (const auto& entity:body.entities) if (entity.id==item.second.get<std::string>("edge") && entity.shape.ShapeType()==TopAbs_EDGE) {
                found=true;
                if (item.second.get<bool>("implicit",false) && BRep_Tool::Degenerated(TopoDS::Edge(entity.shape))) continue;
                double first,last; const auto c=BRep_Tool::Curve(TopoDS::Edge(entity.shape),first,last);
                if (c.IsNull()) throw std::runtime_error("Selected edge has no spatial curve");
                projectJoined(new Geom_TrimmedCurve(c,first,last),item.second.get<bool>("implicit",false));
            }
        if (!found) throw std::runtime_error("Selected projection edge no longer exists");
    }
    for (const auto& item:input.get_child("curves")) projectCurve(output,sketchCurve(item.second),plane,direction);
    for (const auto& curve:contours) projectJoined(curve,true);
    out << "]}";
}

// Intersect the exact solid with an infinite planar face. Each returned face is
// a material region: inner wires remain holes and disconnected faces stay separate.
void sketchSections(std::ostream& out, const Tree& input, const std::vector<Operand>& bodies) {
    const auto& frame = input.get_child("frame");
    const auto origin = point(frame.get_child("origin"));
    const gp_Vec u(point(frame.get_child("u")).XYZ()), v(point(frame.get_child("v")).XYZ());
    Handle(Geom_Plane) plane = new Geom_Plane(gp_Ax3(origin, gp_Dir(u.Crossed(v)), gp_Dir(u)));
    const auto support = BRepBuilderAPI_MakeFace(plane->Pln()).Face();
    out << std::setprecision(17) << "{\"sections\":[";
    bool firstRegion = true;
    for (const auto& body : bodies) {
        BRepAlgoAPI_Common common(body.shape, support);
        if (!common.IsDone() || common.HasErrors()) throw std::runtime_error("Cannot calculate sketch cross section");
        for (TopExp_Explorer faces(common.Shape(), TopAbs_FACE); faces.More(); faces.Next()) {
            if (!firstRegion) out << ',';
            firstRegion = false;
            out << "{\"body\":" << quoted(body.id) << ",\"curves\":";
            planarSketchCurves(out, faces.Current(), frame);
            out << '}';
        }
    }
    out << "]}";
}

void planarSketchCurves(std::ostream& out, const TopoDS_Shape& shape, const Tree& frame) {
    const auto origin = point(frame.get_child("origin"));
    const gp_Vec u(point(frame.get_child("u")).XYZ()), v(point(frame.get_child("v")).XYZ());
    Handle(Geom_Plane) plane = new Geom_Plane(gp_Ax3(origin, gp_Dir(u.Crossed(v)), gp_Dir(u)));
    out << std::setprecision(17) << '[';
    Output output{out, origin, u, v};
    TopTools_IndexedMapOfShape edges;
    TopExp::MapShapes(shape, TopAbs_EDGE, edges);
    for (int i = 1; i <= edges.Extent(); ++i) {
        const auto edge = TopoDS::Edge(edges(i));
        if (BRep_Tool::Degenerated(edge)) continue;
        double first, last;
        const auto curve = BRep_Tool::Curve(edge, first, last);
        if (curve.IsNull()) throw std::runtime_error("Cross section has no spatial boundary");
        // Shared native vertices, not independently evaluated edge curves,
        // define connectivity. Project the shared points onto the section plane.
        const auto forward = TopoDS::Edge(edge.Oriented(TopAbs_FORWARD));
        const Endpoints joined{
            onPlane(BRep_Tool::Pnt(TopExp::FirstVertex(forward)), plane, plane->Pln().Axis().Direction()),
            onPlane(BRep_Tool::Pnt(TopExp::LastVertex(forward)), plane, plane->Pln().Axis().Direction())};
        projectCurve(output, new Geom_TrimmedCurve(curve, first, last), plane, plane->Pln().Axis().Direction(), &joined);
    }
    out << ']';
}
