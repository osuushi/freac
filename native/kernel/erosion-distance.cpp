#include "erosion.h"
#include "erosion-distance-bounds.h"
#include "geometry-policy.h"
#include <BRepAdaptor_Curve.hxx>
#include <BRepAdaptor_Surface.hxx>
#include <BRepBndLib.hxx>
#include <BRepBuilderAPI_MakeVertex.hxx>
#include <BRepClass3d_SolidClassifier.hxx>
#include <BRepExtrema_DistShapeShape.hxx>
#include <BRep_Tool.hxx>
#include <BRep_Builder.hxx>
#include <Bnd_Box.hxx>
#include <TopExp_Explorer.hxx>
#include <TopoDS.hxx>
#include <TopoDS_Compound.hxx>
#include <gp_Pln.hxx>
#include <algorithm>
#include <array>
#include <chrono>
#include <cmath>
#include <limits>
#include <memory>
#include <stdexcept>

namespace {
constexpr double tolerance = geometry_policy::boundaryDistanceMm;
struct Cell {
    std::array<double, 3> low, high;
    gp_Pnt center() const {
        return {(low[0]+high[0])/2, (low[1]+high[1])/2, (low[2]+high[2])/2};
    }
    double radius() const {
        return std::hypot(high[0]-low[0], high[1]-low[1], high[2]-low[2])/2;
    }
    Bnd_Box bounds() const {
        Bnd_Box box;
        box.Update(low[0], low[1], low[2], high[0], high[1], high[2]);
        return box;
    }
    std::array<gp_Pnt, 8> corners() const {
        std::array<gp_Pnt, 8> points;
        for (int i = 0; i < 8; ++i)
            points[i] = {i&1 ? high[0] : low[0], i&2 ? high[1] : low[1], i&4 ? high[2] : low[2]};
        return points;
    }
};
struct Plane {
    gp_Pnt origin;
    gp_Vec outward;
    double clearance(const gp_Pnt& p) const { return -gp_Vec(origin, p).Dot(outward); }
    double reach(const Cell& cell) const {
        double result = 0;
        for (int i = 0; i < 3; ++i)
            result += std::abs(outward.Coord(i+1)) * (cell.high[i]-cell.low[i])/2;
        return result;
    }
};

// For an entirely planar convex solid, its oriented supporting half-spaces
// provide exact box bounds, including the zero-allowance case.
std::vector<Plane> convexPlanes(const TopoDS_Shape& solid) {
    std::vector<Plane> planes;
    for (TopExp_Explorer e(solid, TopAbs_EDGE); e.More(); e.Next())
        if (BRepAdaptor_Curve(TopoDS::Edge(e.Current())).GetType() != GeomAbs_Line) return {};
    for (TopExp_Explorer f(solid, TopAbs_FACE); f.More(); f.Next()) {
        const auto face = TopoDS::Face(f.Current());
        BRepAdaptor_Surface surface(face);
        if (surface.GetType() != GeomAbs_Plane) return {};
        const auto plane = surface.Plane();
        gp_Vec normal(plane.Axis().Direction());
        if (face.Orientation() == TopAbs_REVERSED) normal.Reverse();
        planes.push_back({plane.Location(), normal});
    }
    for (TopExp_Explorer v(solid, TopAbs_VERTEX); v.More(); v.Next())
        for (const auto& plane : planes)
            if (plane.clearance(BRep_Tool::Pnt(TopoDS::Vertex(v.Current()))) < -tolerance) return {};
    return planes;
}

class Distance {
    std::vector<std::unique_ptr<BRepClass3d_SolidClassifier>> classifiers;
    std::vector<std::vector<Plane>> convex;
    std::vector<Bnd_Box> faces;
    BRepExtrema_DistShapeShape extrema;
    std::unique_ptr<erosion::BoundaryDistance> bounds;
public:
    explicit Distance(const TopoDS_Shape& shape) {
        if (shape.IsNull()) return;
        bounds = std::make_unique<erosion::BoundaryDistance>(shape);
        for (TopExp_Explorer s(shape, TopAbs_SOLID); s.More(); s.Next()) {
            classifiers.push_back(std::make_unique<BRepClass3d_SolidClassifier>(s.Current()));
            convex.push_back(convexPlanes(s.Current()));
        }
        for (TopExp_Explorer f(shape, TopAbs_FACE); f.More(); f.Next()) {
            Bnd_Box box;
            BRepBndLib::AddOptimal(f.Current(), box, false, true);
            box.Enlarge(tolerance);
            faces.push_back(box);
        }
        extrema.LoadS2(erosion::boundary(shape));
        extrema.SetDeflection(tolerance/10);
    }
    bool contains(const gp_Pnt& point) {
        for (auto& classifier : classifiers) {
            classifier->Perform(point, tolerance/10);
            if (classifier->State() == TopAbs_IN || classifier->State() == TopAbs_ON) return true;
            if (classifier->State() != TopAbs_OUT)
                throw std::runtime_error("Erosion could not classify the interior");
        }
        return false;
    }
    double upper(const Cell& cell) const { return bounds->upper(cell.corners()); }
    bool contains(const Cell& cell) {
        const auto center = cell.center();
        for (const auto& planes : convex)
            if (!planes.empty() && std::all_of(planes.begin(), planes.end(), [&](const Plane& p) {
                    return p.clearance(center) - p.reach(cell) >= -tolerance/4;
                })) return true;
        const auto box = cell.bounds();
        // With no boundary crossing, classification at one point applies to
        // the whole connected cell. Face bounds are conservative and enlarged.
        if (classifiers.empty()) return false;
        if (std::none_of(faces.begin(), faces.end(), [&](const Bnd_Box& f) { return !f.IsOut(box); }))
            return contains(center);
        if (bounds->lower(center) >= cell.radius() + tolerance && contains(center)) return true;
        // A curved trimmed face's bounding box can cover points far from the
        // actual face. Resolve those cells using an inscribed distance ball.
        return clearance(center) >= cell.radius() + tolerance/4;
    }
    double clearance(const gp_Pnt& point) {
        if (classifiers.empty()) return -std::numeric_limits<double>::infinity();
        if (convex.size() == 1 && !convex.front().empty()) {
            double distance = std::numeric_limits<double>::infinity();
            for (const auto& plane : convex.front()) distance = std::min(distance, plane.clearance(point));
            return distance; // Also an upper bound outside this convex solid.
        }
        if (bounds->exact()) {
            const double distance = bounds->lower(point);
            return contains(point) ? distance : -distance;
        }
        extrema.LoadS1(BRepBuilderAPI_MakeVertex(point).Shape());
        extrema.Perform();
        if (!extrema.IsDone()) throw std::runtime_error("Erosion could not bound distance to the body");
        const double distance = extrema.Value();
        if (!std::isfinite(distance)) throw std::runtime_error("Erosion returned a nonfinite distance");
        return contains(point) ? distance : -distance;
    }
};

Cell innerBounds(const TopoDS_Shape& shape, double depth) {
    Bnd_Box box;
    BRepBndLib::AddOptimal(shape, box, false, true);
    Cell cell;
    box.Get(cell.low[0], cell.low[1], cell.low[2], cell.high[0], cell.high[1], cell.high[2]);
    for (int i = 0; i < 3; ++i) {
        cell.low[i] += depth;
        cell.high[i] -= depth;
    }
    return cell;
}
void subdivide(const Cell& cell, std::vector<Cell>& pending) {
    int axis = 0;
    for (int i = 1; i < 3; ++i)
        if (cell.high[i]-cell.low[i] > cell.high[axis]-cell.low[axis]) axis = i;
    const double middle = (cell.low[axis]+cell.high[axis])/2;
    auto left = cell, right = cell;
    left.high[axis] = right.low[axis] = middle;
    pending.push_back(left);
    pending.push_back(right);
}
}

TopoDS_Shape erosion::boundary(const TopoDS_Shape& shape) {
    TopoDS_Compound result;
    BRep_Builder builder; builder.MakeCompound(result);
    for (TopExp_Explorer f(shape, TopAbs_FACE); f.More(); f.Next()) builder.Add(result, f.Current());
    return result;
}

void erosion::checkCoverage(const TopoDS_Shape& source, const TopoDS_Shape& candidate, double depth) {
    const auto root = innerBounds(source, depth);
    for (int i = 0; i < 3; ++i) if (root.high[i]-root.low[i] <= tolerance/4) return;
    Distance original(source), result(candidate);
    std::vector<Cell> pending{root};
    const auto start = std::chrono::steady_clock::now();
    size_t visits = 0;
    while (!pending.empty()) {
        if (++visits > 100000 || std::chrono::steady_clock::now()-start > std::chrono::seconds(8))
            throw std::runtime_error("Erosion could not verify all interior regions at this allowance; increase the extra thickness allowance");
        const auto cell = pending.back(); pending.pop_back();
        if (original.upper(cell) <= depth + tolerance/4) continue;
        if (result.contains(cell)) continue;
        const double clearance = original.clearance(cell.center());
        // Signed distance is 1-Lipschitz. This bounds the entire cell, rather
        // than silently accepting a grid whose sample points happen to pass.
        if (clearance + cell.radius() <= depth + tolerance/4) continue;
        if (clearance > depth + tolerance && !result.contains(cell.center()))
            throw std::runtime_error("Erosion discarded interior beyond the extra thickness allowance");
        if (cell.radius() <= tolerance/16)
            throw std::runtime_error("Erosion could not resolve an interior boundary within tolerance");
        subdivide(cell, pending);
    }
}
