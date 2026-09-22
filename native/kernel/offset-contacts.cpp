#include "offset-contacts.h"
#include <BRepAdaptor_Surface.hxx>
#include <BRepBuilderAPI_Transform.hxx>
#include <BRepExtrema_DistShapeShape.hxx>
#include <TopExp.hxx>
#include <TopTools_IndexedMapOfShape.hxx>
#include <TopoDS.hxx>
#include <algorithm>
#include <cmath>

namespace {
gp_Vec normal(const TopoDS_Face& face) {
    const auto plane = BRepAdaptor_Surface(face).Plane();
    auto n = gp_Vec(plane.Position().XDirection()).Crossed(gp_Vec(plane.Position().YDirection()));
    if (face.Orientation() == TopAbs_REVERSED) n.Reverse();
    return n;
}
}
// A parallel face joins only when the translated finite face reaches it. Merely
// crossing its infinite supporting plane must not pull unrelated geometry.
std::vector<FaceOffset> offsetContacts(const TopoDS_Shape& body, const std::vector<TopoDS_Face>& seeds, double distance) {
    std::vector<FaceOffset> result;
    for (const auto& seed : seeds) result.push_back({seed, distance});
    TopTools_IndexedMapOfShape faces;
    TopExp::MapShapes(body, TopAbs_FACE, faces);
    for (size_t i = 0; i < result.size(); ++i) {
        const auto moving = result[i];
        BRepAdaptor_Surface source(moving.face);
        if (source.GetType() != GeomAbs_Plane) continue;
        const auto direction = normal(moving.face);
        for (int j = 1; j <= faces.Extent(); ++j) {
            const auto other = TopoDS::Face(faces(j));
            if (std::any_of(result.begin(), result.end(), [&](const FaceOffset& f) { return f.face.IsSame(other); })) continue;
            BRepAdaptor_Surface target(other);
            if (target.GetType() != GeomAbs_Plane || direction.Dot(normal(other)) < 1-1e-9) continue;
            const double travel = gp_Vec(source.Plane().Location(), target.Plane().Location()).Dot(direction);
            if (travel * moving.distance <= 0 || std::abs(travel) > std::abs(moving.distance) + 1e-7) continue;
            gp_Trsf translation; translation.SetTranslation(direction * travel);
            const auto moved = BRepBuilderAPI_Transform(moving.face, translation, true).Shape();
            BRepExtrema_DistShapeShape contact(moved, other);
            if (!contact.IsDone() || contact.Value() > 1e-7) continue;
            result.push_back({other, moving.distance - travel});
        }
    }
    return result;
}
