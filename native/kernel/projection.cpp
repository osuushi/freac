#include "kernel.h"
#include "sketch-curve.h"
#include <BRep_Tool.hxx>
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
#include <gp_Pln.hxx>
#include <gp_Circ.hxx>
#include <algorithm>
#include <cmath>
#include <iomanip>
#include <stdexcept>

namespace {

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
gp_Pnt onPlane(const gp_Pnt& p, const Handle(Geom_Plane)& plane) {
    const auto n=plane->Pln().Axis().Direction();
    return p.Translated(gp_Vec(n)*(-gp_Vec(plane->Location(),p).Dot(gp_Vec(n))));
}
bool linearImage(Output& output, const Handle(Geom_Curve)& source, const Handle(Geom_Plane)& plane) {
    GeomAdaptor_Curve curve(source);
    const double first=curve.FirstParameter(), last=curve.LastParameter();
    auto a=onPlane(curve.Value(first),plane), b=onPlane(curve.Value(last),plane);
    if (curve.GetType()==GeomAbs_Circle && std::abs(curve.Circle().Axis().Direction().Dot(plane->Pln().Axis().Direction()))<1e-12) {
        const auto circle=curve.Circle(); const auto center=onPlane(circle.Location(),plane);
        const gp_Vec u(center,onPlane(circle.Location().Translated(gp_Vec(circle.XAxis().Direction())*circle.Radius()),plane));
        const gp_Vec v(center,onPlane(circle.Location().Translated(gp_Vec(circle.YAxis().Direction())*circle.Radius()),plane));
        const gp_Dir direction(u.SquareMagnitude()>v.SquareMagnitude() ? u:v);
        const double phase=std::atan2(v.Dot(gp_Vec(direction)),u.Dot(gp_Vec(direction))), pi=std::acos(-1.0);
        double low=gp_Vec(center,a).Dot(gp_Vec(direction)), high=gp_Vec(center,b).Dot(gp_Vec(direction));
        if(low>high) std::swap(low,high);
        for(int k=int(std::ceil((first-phase)/pi)); phase+k*pi<=last; ++k) {
            const auto p=onPlane(curve.Value(phase+k*pi),plane);
            const double t=gp_Vec(center,p).Dot(gp_Vec(direction)); low=std::min(low,t); high=std::max(high,t);
        }
        a=center.Translated(gp_Vec(direction)*low); b=center.Translated(gp_Vec(direction)*high);
    } else if(curve.GetType()!=GeomAbs_Line) return false;
    if(a.Distance(b)<1e-7) throw std::runtime_error("Selected edge projects to a point");
    output.begin("segment"); output.point2("a",a); output.point2("b",b); output.out << '}'; return true;
}
void projectCurve(Output& output, const Handle(Geom_Curve)& source, const Handle(Geom_Plane)& plane) {
    if(linearImage(output,source,plane)) return;
    const auto projected = GeomProjLib::ProjectOnPlane(source, plane, plane->Pln().Axis().Direction(), true);
    if (projected.IsNull()) throw std::runtime_error("Curve projection failed");
    const double first=projected->FirstParameter(), last=projected->LastParameter();
    GeomAdaptor_Curve curve(projected);
    if (curve.GetType() == GeomAbs_Line) {
        const auto a=curve.Value(first), b=curve.Value(last);
        if (a.Distance(b)<1e-7) throw std::runtime_error("Selected edge projects to a point");
        output.begin("segment"); output.point2("a",a); output.point2("b",b); output.out << '}'; return;
    }
    if (curve.GetType() == GeomAbs_Circle) {
        const auto circle=curve.Circle(); const double sweep=last-first;
        if (sweep >= 2*std::acos(-1.0)-1e-9) {
            output.begin("circle"); output.point2("center",circle.Location()); output.out << ",\"radius\":" << circle.Radius() << '}';
        } else {
            const double sign=circle.Axis().Direction().Dot(plane->Pln().Axis().Direction())>0 ? 1 : -1;
            output.begin("arc"); output.point2("a",curve.Value(first)); output.point2("b",curve.Value(last));
            output.out << ",\"bulge\":" << std::tan(sign*sweep/4) << '}';
        }
        return;
    }
    if (curve.GetType() == GeomAbs_BezierCurve && !curve.Bezier()->IsRational() && curve.Bezier()->Degree()<=3) {
        auto part=Handle(Geom_BezierCurve)::DownCast(curve.Bezier()->Copy()); part->Segment(first,last); output.cubic(part); return;
    }
    // Half the 0.001 mm budget is reserved for endpoint correction. Failure is explicit.
    GeomConvert_ApproxCurve approximate(projected, 0.0005, GeomAbs_C1, 256, 3);
    if (!approximate.IsDone() || !approximate.HasResult() || approximate.MaxError()>0.0005)
        throw std::runtime_error("Projection exceeds the 0.001 mm approximation tolerance");
    GeomConvert_BSplineCurveToBezierCurve pieces(approximate.Curve());
    for (int i=1; i<=pieces.NbArcs(); ++i) {
        auto piece=pieces.Arc(i);
        if (i==1) {
            if (piece->StartPoint().Distance(projected->Value(first))>0.0005) throw std::runtime_error("Projection endpoint tolerance exceeded");
            piece->SetPole(1,projected->Value(first));
        }
        if (i==pieces.NbArcs()) {
            if (piece->EndPoint().Distance(projected->Value(last))>0.0005) throw std::runtime_error("Projection endpoint tolerance exceeded");
            piece->SetPole(piece->NbPoles(),projected->Value(last));
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
    out << std::setprecision(17) << "{\"curves\":["; Output output{out,origin,U,V};
    for (const auto& item:input.get_child("edges")) {
        bool found=false;
        for (const auto& body:bodies) if (body.id==item.second.get<std::string>("body"))
            for (const auto& entity:body.entities) if (entity.id==item.second.get<std::string>("edge") && entity.shape.ShapeType()==TopAbs_EDGE) {
                double first,last; const auto c=BRep_Tool::Curve(TopoDS::Edge(entity.shape),first,last);
                if (c.IsNull()) throw std::runtime_error("Selected edge has no spatial curve");
                projectCurve(output,new Geom_TrimmedCurve(c,first,last),plane); found=true;
            }
        if (!found) throw std::runtime_error("Selected projection edge no longer exists");
    }
    for (const auto& item:input.get_child("curves")) projectCurve(output,sketchCurve(item.second),plane);
    out << "]}";
}
