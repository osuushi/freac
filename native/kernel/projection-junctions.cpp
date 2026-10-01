#include "kernel.h"
#include "geometry-policy.h"
#include <GeomAPI_ProjectPointOnCurve.hxx>
#include <Geom_TrimmedCurve.hxx>
#include <algorithm>

// An exact contour can meet the interior of a rim. Make that parameter an
// approximation endpoint; fitting a whole rim independently would open the join.
std::vector<Handle(Geom_Curve)> projectionSpans(
    const Handle(Geom_Curve)& curve, const std::vector<gp_Pnt>& junctions) {
    const double first = curve->FirstParameter(), last = curve->LastParameter();
    std::vector<double> cuts{first, last};
    for (const auto& junction : junctions) {
        GeomAPI_ProjectPointOnCurve nearest(junction, curve, first, last);
        if (!nearest.NbPoints() || nearest.LowerDistance() > geometry_policy::parameterCorrespondenceMm) continue;
        const double parameter = nearest.LowerDistanceParameter();
        if (parameter <= first || parameter >= last) continue;
        const auto point = curve->Value(parameter);
        if (std::any_of(cuts.begin(), cuts.end(), [&](double t) {
            return point.Distance(curve->Value(t)) <= geometry_policy::parameterCorrespondenceMm;
        })) continue;
        cuts.push_back(parameter);
    }
    if (cuts.size() == 2) return {curve};
    std::sort(cuts.begin(), cuts.end());
    std::vector<Handle(Geom_Curve)> spans;
    for (size_t i = 1; i < cuts.size(); ++i)
        spans.push_back(new Geom_TrimmedCurve(curve, cuts[i - 1], cuts[i]));
    return spans;
}
