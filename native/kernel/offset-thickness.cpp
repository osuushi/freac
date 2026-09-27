#include "offset-thickness.h"
#include <BRepAdaptor_Surface.hxx>
#include <BRepClass_FaceClassifier.hxx>
#include <IntCurvesFace_ShapeIntersector.hxx>
#include <TopoDS.hxx>
#include <gp_Lin.hxx>
#include <gp_Sphere.hxx>
#include <gp_Cylinder.hxx>
#include <algorithm>
#include <cmath>
#include <vector>

namespace {
constexpr double tolerance = 1e-7;
struct Candidate { int index; double delta; };
double radius(const BRepAdaptor_Surface& surface) {
    return surface.GetType() == GeomAbs_Cylinder ? surface.Cylinder().Radius() : surface.Sphere().Radius();
}
bool concentric(const BRepAdaptor_Surface& a, const BRepAdaptor_Surface& b) {
    if (a.GetType() != b.GetType()) return false;
    if (a.GetType() == GeomAbs_Sphere)
        return a.Sphere().Location().Distance(b.Sphere().Location()) < tolerance;
    const auto x = a.Cylinder(), y = b.Cylinder();
    return x.Axis().Direction().IsParallel(y.Axis().Direction(), 1e-9) &&
           gp_Lin(x.Axis()).Distance(y.Location()) < tolerance;
}
bool visible(const TopoDS_Face& face, const BRepAdaptor_Surface& surface,
             const TopoDS_Face& target, double delta, IntCurvesFace_ShapeIntersector& ray,
             double& slope) {
    // Exact trimmed intersections at sampled source locations: conservative absence,
    // never infer a facing region from display triangles or infinite supports alone.
    for (int u = 1; u < 12; ++u) for (int v = 1; v < 12; ++v) {
        const gp_Pnt2d uv(surface.FirstUParameter() + (surface.LastUParameter()-surface.FirstUParameter())*u/12,
                          surface.FirstVParameter() + (surface.LastVParameter()-surface.FirstVParameter())*v/12);
        BRepClass_FaceClassifier classifier(face, uv, tolerance);
        if (classifier.State() != TopAbs_IN) continue;
        gp_Pnt point; gp_Vec du, dv;
        surface.D1(uv.X(), uv.Y(), point, du, dv);
        gp_Vec radial;
        if (surface.GetType() == GeomAbs_Sphere) radial = gp_Vec(surface.Sphere().Location(), point);
        else {
            const auto cylinder = surface.Cylinder();
            const gp_Vec axis(cylinder.Axis().Direction()), from(cylinder.Location(), point);
            radial = from - axis * from.Dot(axis);
        }
        radial.Normalize();
        const auto normal = du.Crossed(dv);
        if (normal.SquareMagnitude() < 1e-20) continue;
        const double outward = (normal.Dot(radial) > 0 ? 1 : -1) * (face.Orientation() == TopAbs_REVERSED ? -1 : 1);
        const gp_Dir direction(radial * (delta > 0 ? 1 : -1));
        ray.Perform(gp_Lin(point, direction), tolerance * 10, std::abs(delta) + tolerance);
        if (!ray.IsDone()) continue;
        double first = std::abs(delta) + tolerance * 2;
        bool hit = false;
        for (int i = 1; i <= ray.NbPnt(); ++i) {
            const double distance = ray.WParameter(i);
            if (distance < first - tolerance) {
                first = distance;
                hit = ray.Face(i).IsSame(target);
            } else if (std::abs(distance-first) <= tolerance && !ray.Face(i).IsSame(target)) hit = false;
        }
        if (hit && std::abs(first-std::abs(delta)) < tolerance) {
            slope = (delta > 0 ? -1 : 1) * outward;
            return true;
        }
    }
    return false;
}
}

void presentOffsetThickness(std::ostream& out, const TopoDS_Face& face,
                            const TopTools_IndexedMapOfShape& faces, const TopoDS_Shape& body) {
    out << ",\"thickness\":";
    const BRepAdaptor_Surface surface(face);
    if (surface.GetType() != GeomAbs_Cylinder && surface.GetType() != GeomAbs_Sphere) { out << "null"; return; }
    std::vector<Candidate> candidates;
    for (int i = 1; i <= faces.Extent(); ++i) {
        if (faces(i).IsSame(face)) continue;
        const BRepAdaptor_Surface other(TopoDS::Face(faces(i)));
        if (!concentric(surface, other)) continue;
        const double delta = radius(other) - radius(surface);
        if (std::abs(delta) > tolerance) candidates.push_back({i, delta});
    }
    std::sort(candidates.begin(), candidates.end(), [](const auto& a, const auto& b) { return std::abs(a.delta) < std::abs(b.delta); });
    if (!candidates.empty()) {
        IntCurvesFace_ShapeIntersector ray;
        ray.Load(body, tolerance);
        for (const auto& candidate : candidates) {
            double slope;
            if (!visible(face, surface, TopoDS::Face(faces(candidate.index)), candidate.delta, ray, slope)) continue;
            out << "{\"faceIndex\":" << candidate.index-1 << ",\"distance\":" << std::abs(candidate.delta)
                << ",\"slope\":" << slope << '}';
            return;
        }
    }
    out << "null";
}
