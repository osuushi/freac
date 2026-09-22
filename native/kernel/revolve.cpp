#include "screw-sweep.h"
#include <BRepPrimAPI_MakeRevol.hxx>
#include <cmath>
#include <stdexcept>

TopoDS_Shape revolve(const Tree& input, const std::vector<Operand>& bodies) {
    const double degrees = input.get<double>("angle"), height = input.get<double>("height");
    if (!std::isfinite(degrees) || !std::isfinite(height) || std::abs(degrees) < 1e-7)
        throw std::runtime_error("Revolve needs a finite nonzero angle and finite height");
    if (height == 0 && std::abs(degrees) > 360 + 1e-7)
        throw std::runtime_error("Set a nonzero height for more than one revolution");
    const auto direction = point(input.get_child("axis.direction"));
    const gp_Vec vector(direction.X(), direction.Y(), direction.Z());
    if (std::abs(vector.Magnitude() - 1) > 1e-7) throw std::runtime_error("Revolution axis must be a unit vector");
    const gp_Ax1 axis(point(input.get_child("axis.origin")), gp_Dir(vector));
    const double angle = (degrees / 180) * std::acos(-1.0);
    TopoDS_Shape tool;
    for (const auto& item : input.get_child("profiles")) {
        for (const auto& face : axialSections(profileFace(item.second, bodies), axis)) {
            TopoDS_Shape shape;
            if (height == 0) {
                BRepPrimAPI_MakeRevol builder(face, axis, angle, true);
                if (!builder.IsDone()) throw std::runtime_error("Revolution failed");
                shape = builder.Shape();
            } else shape = screwSweep(face, axis, angle, height);
            validate(shape);
            if (volume(shape) <= 1e-10) throw std::runtime_error("A profile section produced no swept material");
            if (tool.IsNull()) tool = shape;
            else { std::vector<SourceEntity> unused; tool = booleanShape(tool, shape, "union", unused); }
        }
    }
    if (tool.IsNull()) throw std::runtime_error("Select at least one closed region or face");
    validateSweptSolids(tool);
    return tool;
}
