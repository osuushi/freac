#pragma once
#include <BRepBuilderAPI_MakeVertex.hxx>
#include <BRepExtrema_DistShapeShape.hxx>
#include <BRepExtrema_ExtPF.hxx>
#include <TopExp_Explorer.hxx>
#include <TopoDS.hxx>
#include <memory>
#include <vector>

// A point on a trimmed face within tolerance is sufficient evidence of boundary
// proximity. Reuse surface-extrema initialization and try the last matching face
// first. Edge/corner cases still use the full shape-distance query below.
class SweepBoundaryDistance {
    struct FaceQuery {
        TopoDS_Face face;
        BRepExtrema_ExtPF query;
        explicit FaceQuery(const TopoDS_Face& value) : face(value) { query.Initialize(face); }
    };
    // Extrema retains a pointer to its adaptor: keep each query at a stable address.
    std::vector<std::unique_ptr<FaceQuery>> faces;
    BRepExtrema_DistShapeShape fallback;
    size_t last = 0;
public:
    explicit SweepBoundaryDistance(const TopoDS_Shape& boundary) {
        fallback.LoadS2(boundary);
        for (TopExp_Explorer e(boundary, TopAbs_FACE); e.More(); e.Next())
            faces.push_back(std::make_unique<FaceQuery>(TopoDS::Face(e.Current())));
    }
    bool within(const gp_Pnt& point, double tolerance) {
        const auto vertex = BRepBuilderAPI_MakeVertex(point).Vertex();
        for (size_t i = 0; i < faces.size(); ++i) {
            const size_t index = (last + i) % faces.size();
            auto& face = *faces[index];
            face.query.Perform(vertex, face.face);
            if (!face.query.IsDone()) continue;
            for (int j = 1; j <= face.query.NbExt(); ++j)
                if (face.query.SquareDistance(j) <= tolerance * tolerance) {
                    last = index;
                    return true;
                }
        }
        fallback.LoadS1(vertex);
        fallback.Perform();
        return fallback.IsDone() && fallback.Value() <= tolerance;
    }
};
