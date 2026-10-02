#include "erosion-distance-bounds.h"
#include "geometry-policy.h"
#include <BRepAdaptor_Curve.hxx>
#include <BRepAdaptor_Surface.hxx>
#include <BRepBndLib.hxx>
#include <BRepBuilderAPI_Copy.hxx>
#include <BRepMesh_IncrementalMesh.hxx>
#include <BRep_Tool.hxx>
#include <Bnd_Box.hxx>
#include <TopExp_Explorer.hxx>
#include <TopoDS.hxx>
#include <gp_Cylinder.hxx>
#include <gp_Pln.hxx>
#include <gp_Sphere.hxx>
#include <gp_Torus.hxx>
#include <algorithm>
#include <cmath>
#include <limits>
#include <stdexcept>
#include <vector>

namespace {
double segmentDistance(const gp_Pnt& p, const gp_Pnt& a, const gp_Pnt& b) {
    const gp_Vec edge(a, b), v(a, p);
    const double t = edge.SquareMagnitude() > 0
        ? std::clamp(v.Dot(edge)/edge.SquareMagnitude(), 0.0, 1.0) : 0;
    return (v-edge*t).Magnitude();
}
struct Triangle {
    gp_Pnt a, b, c;
    double distance(const gp_Pnt& p) const {
        const gp_Vec u(a, b), v(a, c), w(a, p);
        const double uu = u.Dot(u), vv = v.Dot(v), uv = u.Dot(v);
        const double determinant = uu*vv-uv*uv;
        if (determinant > 0) {
            const double x = (w.Dot(u)*vv-w.Dot(v)*uv)/determinant;
            const double y = (w.Dot(v)*uu-w.Dot(u)*uv)/determinant;
            if (x >= 0 && y >= 0 && x+y <= 1)
                return std::abs(w.Dot(u.Crossed(v)))/std::sqrt(determinant);
        }
        return std::min({segmentDistance(p, a, b), segmentDistance(p, b, c), segmentDistance(p, c, a)});
    }
};
struct Support {
    BRepAdaptor_Surface surface;
    double lo[3], hi[3];
    explicit Support(const TopoDS_Face& face) : surface(face) {
        Bnd_Box box;
        BRepBndLib::AddOptimal(face, box, false, true);
        box.Get(lo[0], lo[1], lo[2], hi[0], hi[1], hi[2]);
    }
    double lower(const gp_Pnt& p) const {
        double squared = 0;
        for (int i = 0; i < 3; ++i) {
            const double delta = std::max({lo[i]-p.Coord(i+1), p.Coord(i+1)-hi[i], 0.0});
            squared += delta*delta;
        }
        double distance = 0;
        switch (surface.GetType()) {
            case GeomAbs_Plane: distance = surface.Plane().Distance(p); break;
            case GeomAbs_Cylinder: {
                const auto cylinder = surface.Cylinder();
                const gp_Vec v(cylinder.Location(), p), axis(cylinder.Axis().Direction());
                distance = std::abs((v-axis*v.Dot(axis)).Magnitude()-cylinder.Radius());
                break;
            }
            case GeomAbs_Sphere: {
                const auto sphere = surface.Sphere();
                distance = std::abs(p.Distance(sphere.Location())-sphere.Radius());
                break;
            }
            case GeomAbs_Torus: {
                const auto torus = surface.Torus();
                const gp_Vec v(torus.Location(), p), axis(torus.Axis().Direction());
                const double z = v.Dot(axis), radial = (v-axis*z).Magnitude();
                distance = std::abs(std::hypot(radial-torus.MajorRadius(), z)-torus.MinorRadius());
                break;
            }
            default: break;
        }
        // Trimming can only increase distance to a support. Its enclosing box
        // supplies an independent lower bound, particularly beyond a join.
        return std::max(distance, std::sqrt(squared));
    }
};
bool planarPolygon(const TopoDS_Shape& shape) {
    for (TopExp_Explorer f(shape, TopAbs_FACE); f.More(); f.Next())
        if (BRepAdaptor_Surface(TopoDS::Face(f.Current())).GetType() != GeomAbs_Plane) return false;
    for (TopExp_Explorer e(shape, TopAbs_EDGE); e.More(); e.Next())
        if (BRepAdaptor_Curve(TopoDS::Edge(e.Current())).GetType() != GeomAbs_Line) return false;
    return true;
}
}

struct erosion::BoundaryDistance::Impl {
    bool exact;
    std::vector<Triangle> triangles;
    std::vector<Support> supports;
    explicit Impl(const TopoDS_Shape& shape) : exact(planarPolygon(shape)) {
        const auto copy = BRepBuilderAPI_Copy(shape, true, false).Shape();
        BRepMesh_IncrementalMesh mesh(copy, 0.01, false, 0.1, false);
        for (TopExp_Explorer f(copy, TopAbs_FACE); f.More(); f.Next()) {
            if (!planarPolygon(f.Current())) {
                supports.emplace_back(TopoDS::Face(f.Current()));
                continue;
            }
            TopLoc_Location location;
            const auto triangulation = BRep_Tool::Triangulation(TopoDS::Face(f.Current()), location);
            if (triangulation.IsNull()) throw std::runtime_error("Erosion could not partition a planar face");
            for (int i = 1; i <= triangulation->NbTriangles(); ++i) {
                int a, b, c; triangulation->Triangle(i).Get(a, b, c);
                triangles.push_back({triangulation->Node(a).Transformed(location.Transformation()),
                    triangulation->Node(b).Transformed(location.Transformation()),
                    triangulation->Node(c).Transformed(location.Transformation())});
            }
        }
    }
};

erosion::BoundaryDistance::BoundaryDistance(const TopoDS_Shape& shape) : impl(std::make_unique<Impl>(shape)) {}
erosion::BoundaryDistance::~BoundaryDistance() = default;
bool erosion::BoundaryDistance::exact() const { return impl->exact; }
double erosion::BoundaryDistance::lower(const gp_Pnt& point) const {
    double distance = std::numeric_limits<double>::infinity();
    for (const auto& triangle : impl->triangles) distance = std::min(distance, triangle.distance(point));
    for (const auto& support : impl->supports) distance = std::min(distance, support.lower(point));
    return distance;
}
double erosion::BoundaryDistance::upper(const std::array<gp_Pnt, 8>& corners) const {
    double distance = std::numeric_limits<double>::infinity();
    // Distance to a convex triangle is convex: its maximum over a box is
    // attained at a corner. Each triangle belongs to the actual boundary.
    for (const auto& triangle : impl->triangles) {
        double maximum = 0;
        for (const auto& corner : corners) maximum = std::max(maximum, triangle.distance(corner));
        distance = std::min(distance, maximum);
    }
    return distance;
}
