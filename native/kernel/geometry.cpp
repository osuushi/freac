#include "kernel.h"
#include "boundary-move.h"
#include <BRepBuilderAPI_MakeEdge.hxx>
#include <BRepBuilderAPI_MakeWire.hxx>
#include <BRepBuilderAPI_MakeFace.hxx>
#include <BRepExtrema_DistShapeShape.hxx>
#include <BRepBndLib.hxx>
#include <Bnd_Box.hxx>
#include <GC_MakeArcOfCircle.hxx>
#include <Geom_TrimmedCurve.hxx>
#include <Geom_BezierCurve.hxx>
#include <TColgp_Array1OfPnt.hxx>
#include <TopoDS.hxx>
#include <TopoDS_Wire.hxx>
#include <gp_Circ.hxx>
#include <algorithm>
#include <cmath>
#include <stdexcept>

namespace {
TopoDS_Wire wire(const Tree& spans) {
    BRepBuilderAPI_MakeWire builder;
    for (const auto& item : spans) {
        const auto& span = item.second;
        if (span.get<std::string>("kind") == "circle") {
            const auto n = point(span.get_child("normal")), x = point(span.get_child("axis"));
            const gp_Ax2 axes(point(span.get_child("center")),
                             gp_Dir(n.X(), n.Y(), n.Z()), gp_Dir(x.X(), x.Y(), x.Z()));
            builder.Add(BRepBuilderAPI_MakeEdge(gp_Circ(axes, span.get<double>("radius"))));
            continue;
        }
        const auto a = point(span.get_child("a")), b = point(span.get_child("b"));
        if (span.get<std::string>("kind") == "bezier") {
            TColgp_Array1OfPnt poles(1,4); poles(1)=a; poles(2)=point(span.get_child("c1"));
            poles(3)=point(span.get_child("c2")); poles(4)=b;
            builder.Add(BRepBuilderAPI_MakeEdge(new Geom_BezierCurve(poles)));
        } else if (span.get<std::string>("kind") == "line") builder.Add(BRepBuilderAPI_MakeEdge(a, b));
        else {
            GC_MakeArcOfCircle arc(a, point(span.get_child("mid")), b);
            if (!arc.IsDone()) throw std::runtime_error("Cannot construct circular profile span");
            builder.Add(BRepBuilderAPI_MakeEdge(arc.Value()));
        }
    }
    if (!builder.IsDone()) throw std::runtime_error("Profile boundary is not a valid wire");
    return builder.Wire();
}

}
TopoDS_Face profileFace(const Tree& profile, const std::vector<Operand>& bodies) {
    TopoDS_Face face;
    if (auto key = profile.get_optional<std::string>("face")) {
        bool found = false;
        for (const auto& body : bodies) for (const auto& entity : body.entities)
            if (entity.id == *key && entity.shape.ShapeType() == TopAbs_FACE) { face = TopoDS::Face(entity.shape); found = true; }
        if (!found) throw std::runtime_error("Selected face no longer exists");
    } else {
        BRepBuilderAPI_MakeFace builder(wire(profile.get_child("outer")), true);
        for (const auto& hole : profile.get_child("holes")) builder.Add(TopoDS::Wire(wire(hole.second).Reversed()));
        if (!builder.IsDone()) throw std::runtime_error("Profile is not a planar face");
        face = builder.Face(); validate(face);
    }
    return face;
}
TopoDS_Shape sweep(const Tree& input, const std::vector<Operand>& bodies) {
    const double distance = input.get<double>("distance");
    if (!std::isfinite(distance) || std::abs(distance) < 1e-8) throw std::runtime_error("Extrusion needs a nonzero distance");
    const auto direction = point(input.get_child("normal"));
    gp_Vec vector(direction.X(), direction.Y(), direction.Z());
    if (std::abs(vector.Magnitude() - 1) > 1e-7) throw std::runtime_error("Extrusion axis must be a unit vector");
    vector *= distance; TopoDS_Shape tool;
    for (const auto& item : input.get_child("profiles")) {
        const auto face = profileFace(item.second, bodies);
        const auto shape = extrudeProfile(face, vector, input);
        validate(shape);
        if (tool.IsNull()) tool = shape;
        else { std::vector<SourceEntity> unused; tool = booleanShape(tool, shape, "union", unused); }
    }
    if (tool.IsNull()) throw std::runtime_error("Select at least one closed region or face");
    return tool;
}
std::vector<Result> calculate(const Tree& input, const std::vector<Operand>& bodies,
                             std::string& mode, std::vector<std::string>& participants) {
    if (input.get<std::string>("kind", "") == "plane-cut") {
        mode = "new"; return cutWithPlane(input, bodies, participants);
    }
    if (input.get<std::string>("kind", "extrude") == "inspect") {
        std::vector<Result> results;
        for (const auto& body : bodies) solids(results, body.shape, body.entities, {body.id});
        mode = "inspect"; return results;
    }
    if (input.get<std::string>("kind", "") == "delete-topology") {
        mode = "new"; return deleteTopology(input, bodies, participants);
    }
    if (input.get<std::string>("kind", "") == "shell") {
        mode = "new"; return shellBodies(input, bodies, participants);
    }
    if (input.get<std::string>("kind", "") == "cleanup") {
        mode = "new"; return cleanupBodies(input, bodies, participants);
    }
    if (input.get<std::string>("kind", "") == "move-edges" ||
        input.get<std::string>("kind", "") == "scale-boundaries") {
        mode = "new"; return reconnectBoundaries(input, bodies, participants);
    }
    if (input.get<std::string>("kind", "") == "move-faces") {
        mode = "new"; return reconnectBoundaries(input, bodies, participants);
    }
    if (input.get<std::string>("kind", "") == "transform" ||
        input.get<std::string>("kind", "") == "mirror" ||
        input.get<std::string>("kind", "") == "scale") {
        mode = "new"; return transformBodies(input, bodies, participants);
    }
    if (input.get<std::string>("kind", "") == "offset-faces") {
        mode = "new"; return offsetFaces(input, bodies, participants);
    }
    if (input.get<std::string>("kind", "") == "edge-finish") {
        mode = "new"; return finishEdges(input, bodies, participants);
    }
    if (input.get<std::string>("kind", "") == "boolean") {
        mode = input.get<std::string>("mode"); return booleanBodies(input, bodies, participants);
    }
    const auto tool = input.get<std::string>("kind") == "revolve"
        ? revolve(input, bodies) : input.get<std::string>("kind") == "path-sweep"
            ? pathSweep(input, bodies) : sweep(input, bodies);
    mode = input.get<std::string>("mode");
    if (mode != "auto" && mode != "new" && mode != "union" && mode != "subtract" && mode != "intersect")
        throw std::runtime_error("Unknown Boolean mode");
    std::vector<Result> results;
    if (mode == "new") { solids(results, tool, {}, {}); return results; }
    Bnd_Box toolBounds; BRepBndLib::Add(tool, toolBounds, false); toolBounds.Enlarge(1e-7);
    std::vector<const Operand*> positive, contact, explicitTargets;
    const auto eligible = input.get_child_optional("eligibleTargets");
    const auto targetList = input.get_child_optional("targets");
    for (const auto& body : bodies) {
        if (eligible && std::none_of(eligible->begin(), eligible->end(), [&](const auto& v) { return v.second.template get_value<std::string>() == body.id; })) continue;
        if (targetList && std::none_of(targetList->begin(), targetList->end(), [&](const auto& v) { return v.second.template get_value<std::string>() == body.id; })) continue;
        if (targetList) {
            explicitTargets.push_back(&body);
            if (mode != "auto") continue;
        }
        Bnd_Box bodyBounds; BRepBndLib::Add(body.shape, bodyBounds, false); bodyBounds.Enlarge(1e-7);
        if (toolBounds.IsOut(bodyBounds)) continue;
        if (mode == "union") {
            BRepExtrema_DistShapeShape separation(body.shape, tool);
            if (separation.IsDone() && separation.Value() < 1e-7) contact.push_back(&body);
        } else {
            std::vector<SourceEntity> unused;
            const auto common = booleanShape(body.shape, tool, "intersect", unused);
            if (volume(common) > 1e-10) positive.push_back(&body);
            else if (mode == "auto") {
                BRepExtrema_DistShapeShape separation(body.shape, tool);
                if (separation.IsDone() && separation.Value() < 1e-7) contact.push_back(&body);
            }
        }
    }
    // Auto keeps Union as the neutral default when nothing intersects. The
    // union path with no participants still returns an independent solid, but
    // preserves the user's intended default operation in the widget and reply.
    if (mode == "auto") mode = positive.empty() ? "union" : "subtract";
    if (mode == "new") { solids(results, tool, {}, {}); return results; }
    const auto& selected = targetList ? explicitTargets : mode == "union" ? contact : positive;
    if (selected.empty() && mode != "union") throw std::runtime_error("The swept shape does not intersect a target body");
    if (mode == "union") {
        auto shape = tool; std::vector<SourceEntity> origins;
        for (const auto* body : selected) {
            participants.push_back(body->id); origins.insert(origins.end(), body->entities.begin(), body->entities.end());
            shape = booleanShape(shape, body->shape, mode, origins);
        }
        solids(results, shape, origins, participants);
    } else for (const auto* body : selected) {
        participants.push_back(body->id); auto origins = body->entities;
        const auto shape = booleanShape(body->shape, tool, mode, origins);
        solids(results, shape, origins, {body->id});
    }
    return results;
}
