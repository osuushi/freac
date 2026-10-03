#include "erosion.h"
#include "erosion-field.h"
#include "shell-validation.h"
#include "offset-geometry.h"
#include "offset-repair.h"
#include "timing.h"
#include <BRep_Builder.hxx>
#include <Standard_Failure.hxx>
#include <TopExp_Explorer.hxx>
#include <TopoDS_Compound.hxx>
#include <algorithm>
#include <cmath>
#include <set>
#include <limits>
#include <stdexcept>

namespace {
TopoDS_Shape empty() {
    TopoDS_Compound shape; BRep_Builder().MakeCompound(shape); return shape;
}

void coverageFailure(const erosion::CoverageFailure& e,double thickness,double allowance,double& suggestion) {
    if (std::isfinite(e.requiredDepth) && e.requiredDepth > thickness + allowance) {
        const double needed = std::max(e.requiredDepth-thickness, allowance*1.25);
        const double step = std::pow(10, std::floor(std::log10(needed))-1);
        // Add 20% to the previous 10% headroom to reduce retry cycles.
        suggestion = std::min(suggestion, std::ceil(needed*1.32/step)*step);
    }
    // A verified minimum-thickness candidate already exists. Repeating
    // the same expensive coverage failure does not improve feedback.
    if (e.exhausted) throw erosion::AllowanceFailure(e.what(), suggestion);
}

TopoDS_Shape cavity(const Operand& original, double thickness, double allowance) {
    KernelTiming timing("erode-body"); timing.phase("begin");
    const auto source = shell_tool::canonical(original, "Erode");
    timing.phase("prepare");
    // Empty is a geometric result only after an independent interior bound.
    try {
        erosion::checkCoverage(source.shape, empty(), thickness);
        return empty();
    } catch (const std::runtime_error&) { /* A surviving or unresolved interior needs construction. */ }
    const auto simplified = erosion::simplify(source.shape, allowance);
    timing.phase("simplify");
    std::vector<TopoDS_Shape> inputs{simplified};
    if (!simplified.IsSame(source.shape)) inputs.push_back(source.shape);
    const auto withoutCollapsed = erosion::removeCollapsedFeatures(source.shape, thickness);
    if (!withoutCollapsed.IsSame(source.shape)) inputs.push_back(withoutCollapsed);
    std::string failure = "Erosion could not construct an editable eroded body";
    double suggestion = std::numeric_limits<double>::infinity();
    std::vector<double> distances{thickness};
    // A round can collapse at exactly the requested depth. Spend part of the
    // explicit allowance to cross that singularity, then verify against the
    // original requested bounds, not the construction distance.
    if (allowance > 1e-5) distances.push_back(thickness + allowance/2);
    for (const double distance : distances) for (const auto& input : inputs) {
        for (const bool intersections : {false, true}) {
            try {
                const auto result = erosion::offset(input, distance, intersections);
                timing.phase("offset");
                erosion::validateCavity(original.shape, result, thickness, allowance);
                timing.phase("verify");
                return result;
            } catch (const erosion::CoverageFailure& e) {
                failure = e.what();
                coverageFailure(e,thickness,allowance,suggestion);
            } catch (const Standard_Failure& e) {
                failure = e.GetMessageString() ? e.GetMessageString() : "Erosion construction failed";
            } catch (const std::runtime_error& e) { failure = e.what(); }
        }
    }
    // The allowance may legitimately eliminate a marginal body, but an
    // unverified offset failure must never erase a spacious interior.
    try {
        erosion::checkCoverage(original.shape, empty(), thickness + allowance);
        return empty();
    } catch (const std::runtime_error&) {
        throw erosion::AllowanceFailure(failure, suggestion);
    }
}
}

std::vector<Result> erodeBodies(const Tree& input, const std::vector<Operand>& bodies,
                               std::vector<std::string>& participants) {
    const double thickness = input.get<double>("thickness");
    const double allowance = input.get<double>("allowance");
    const auto method = input.get<std::string>("method", "fast");
    if (method != "fast" && method != "accurate")
        throw std::runtime_error("Choose Fast or Accurate erosion");
    if (!std::isfinite(thickness) || thickness <= 1e-5 ||
        !std::isfinite(allowance) || allowance < 0)
        throw std::runtime_error("Erode needs positive finite thickness and nonnegative extra thickness allowance");
    const auto ids = input.get_child("ids");
    if (ids.empty() || ids.size() > 1000) throw std::runtime_error("Select complete bodies to erode");
    std::set<std::string> seen;
    std::vector<Result> results;
    for (const auto& item : ids) {
        const auto id = item.second.get_value<std::string>();
        const auto source = std::find_if(bodies.begin(), bodies.end(), [&](const Operand& b) { return b.id == id; });
        if (source == bodies.end() || !seen.insert(id).second)
            throw std::runtime_error("Select existing erosion bodies only once");
        const auto original = offset_geometry::encoding(source->shape);
        const auto shape = method == "fast"
            ? erosion::reconstructInterior(source->shape, thickness, allowance)
            : cavity(*source, thickness, allowance);
        if (offset_geometry::encoding(source->shape) != original)
            throw std::runtime_error("Erosion altered its source body");
        for (TopExp_Explorer s(shape, TopAbs_SOLID); s.More(); s.Next())
            results.push_back({s.Current(), {}, {id}, {}, true});
        if (!input.get<bool>("keepOriginals", true)) participants.push_back(id);
    }
    return results;
}
