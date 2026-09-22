#include "offset-result.h"
#include "offset-geometry.h"
#include "timing.h"
#include <BRepOffset_MakeOffset.hxx>
#include <BRepExtrema_DistShapeShape.hxx>
#include <TopExp.hxx>
#include <TopTools_IndexedMapOfShape.hxx>
#include <TopoDS.hxx>
#include <algorithm>
#include <cmath>
#include <stdexcept>

namespace {
constexpr const char* context = "Kernel produced invalid geometry: offset";
void require(bool condition, const char* message) {
    if (!condition) throw std::runtime_error(std::string(context) + " " + message);
}
}
void checkFreeformOffset(const Operand& body, BRepOffset_MakeOffset& operation,
                        const std::vector<FaceOffset>& offsets) {
    const auto result = operation.Shape();
    KernelTiming timing("offset-validation");
    offset_geometry::validSolid(result, context);
    timing.phase("solid");
    TopTools_IndexedMapOfShape faces, accounted;
    TopExp::MapShapes(result, TopAbs_FACE, faces);
    for (const auto& source : body.entities) {
        if (source.shape.ShapeType() != TopAbs_FACE) continue;
        const auto selected = std::find_if(offsets.begin(), offsets.end(),
            [&](const auto& entry) { return entry.face.IsSame(source.shape); });
        const double amount = selected == offsets.end() ? 0 : selected->distance;
        TopTools_IndexedMapOfShape successors;
        if (faces.Contains(source.shape)) successors.Add(source.shape);
        for (const auto* list : {&operation.Modified(source.shape), &operation.Generated(source.shape)})
            for (const auto& face : *list)
                if (face.ShapeType() == TopAbs_FACE && faces.Contains(face)) successors.Add(face);
        require(!successors.IsEmpty(), "lost correspondence with a source face");
        for (int i = 1; i <= successors.Extent(); ++i) {
            const auto from = TopoDS::Face(source.shape), to = TopoDS::Face(faces(faces.FindIndex(successors(i))));
            offset_geometry::checkParallel(from, to, amount, context, true);
            accounted.Add(to);
            if (std::abs(amount) <= 1e-8) continue;
            BRepExtrema_DistShapeShape separation(from, to);
            require(separation.IsDone() && separation.Value() >= std::abs(amount) - offset_geometry::tolerance,
                    "did not preserve the requested surface separation");
        }
    }
    timing.phase("surfaces");
    require(accounted.Extent() == faces.Extent(), "introduced an unexplained face");
}
