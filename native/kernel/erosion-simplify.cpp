#include "erosion.h"
#include "offset-geometry.h"
#include "offset-repair.h"
#include <BRepAdaptor_Surface.hxx>
#include <BRepAlgoAPI_Cut.hxx>
#include <BRepAlgoAPI_Defeaturing.hxx>
#include <BRepBndLib.hxx>
#include <BRepBuilderAPI_Copy.hxx>
#include <BRepBuilderAPI_Transform.hxx>
#include <Bnd_Box.hxx>
#include <Standard_Failure.hxx>
#include <TopExp.hxx>
#include <TopExp_Explorer.hxx>
#include <TopTools_IndexedMapOfShape.hxx>
#include <TopTools_MapOfShape.hxx>
#include <TopoDS.hxx>
#include <gp_Pln.hxx>
#include <stdexcept>

namespace {
TopTools_MapOfShape shallowProtrusions(const TopoDS_Shape& shape, double allowance) {
    TopTools_MapOfShape removable;
    for (TopExp_Explorer host(shape, TopAbs_FACE); host.More(); host.Next()) {
        const auto face = TopoDS::Face(host.Current());
        BRepAdaptor_Surface surface(face);
        if (surface.GetType() != GeomAbs_Plane) continue;
        auto normal = surface.Plane().Axis().Direction();
        if (face.Orientation() == TopAbs_REVERSED) normal.Reverse();
        gp_Trsf frame;
        frame.SetTransformation(gp_Ax3(surface.Plane().Location(), normal));
        for (TopExp_Explorer other(shape, TopAbs_FACE); other.More(); other.Next()) {
            if (other.Current().IsSame(face)) continue;
            Bnd_Box box;
            BRepBndLib::AddOptimal(BRepBuilderAPI_Transform(other.Current(), frame, true).Shape(),
                                  box, false, false);
            double x0, y0, z0, x1, y1, z1;
            box.Get(x0, y0, z0, x1, y1, z1);
            if (z0 >= -1e-7 && z1 > 1e-6 && z1 <= allowance)
                removable.Add(other.Current());
        }
    }
    return removable;
}
}

TopoDS_Shape erosion::simplify(const TopoDS_Shape& source, double allowance) {
    if (allowance <= 1e-5) return source;
    const auto copy = BRepBuilderAPI_Copy(source, true, false).Shape();
    const auto removable = shallowProtrusions(copy, allowance/2);
    if (removable.IsEmpty()) return source;
    try {
        // One feature-healing calculation, not an iterated solid subtraction
        // per sample. Source geometry remains untouched on every failed proposal.
        BRepAlgoAPI_Defeaturing heal;
        heal.SetShape(copy);
        for (TopTools_MapOfShape::Iterator i(removable); i.More(); i.Next())
            heal.AddFaceToRemove(i.Key());
        heal.Build();
        if (!heal.IsDone() || heal.HasErrors() || heal.HasWarnings()) return source;
        TopExp_Explorer solids(heal.Shape(), TopAbs_SOLID);
        if (!solids.More()) return source;
        const auto result = solids.Current(); solids.Next();
        if (solids.More()) return source;
        TopTools_IndexedMapOfShape before, after;
        TopExp::MapShapes(source, TopAbs_FACE, before);
        TopExp::MapShapes(result, TopAbs_FACE, after);
        if (after.Extent() >= before.Extent()) return source;
        offset_geometry::tightenGeneratedBoundaries(result, source);
        // At zero erosion depth these checks establish E_allowance(source)
        // subset simplified subset source. Only half the total budget is spent.
        validateCavity(source, result, 0, allowance/2);
        return result;
    } catch (const Standard_Failure&) { return source; }
      catch (const std::runtime_error&) { return source; }
}
