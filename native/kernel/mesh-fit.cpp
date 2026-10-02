#include "mesh-fit.h"
#include <algorithm>
#include <cstdlib>
#include <iomanip>
#include <sstream>
#include <stdexcept>
#include <iostream>

namespace mesh_fit {
void reconstruct(std::ostream& out, const Tree& tree) {
    const auto input = read(tree);
    // With no declared creases, a coarse triangle's steep normal change is curvature,
    // not a request for a sharp feature (especially around thin, rounded rims).
    Search target(input.target,input.layout.creases.empty());
    auto network = initialize(input.layout,target);
    Statistics stats;
    while (true) {
        if (std::getenv("MAKESHIFT_KERNEL_TIMING")) std::cerr << "mesh-fit: " << network.patches.size() << " patches\n";
        const auto seed = network;
        for (int pass = 0; pass < 3; ++pass) {
            fit(network,seed,input.target,target,12);
            stats = assess(network,input.target,target);
            if (stats.oriented && std::max(stats.forward,stats.reverse) <= input.tolerance && stats.normalAngle <= input.smoothAngle) break;
        }
        if (std::getenv("MAKESHIFT_KERNEL_TIMING")) std::cerr << "mesh-fit deviation "
            << std::max(stats.forward,stats.reverse)*input.scale << ", seam " << stats.normalAngle << "\n";
        if (stats.oriented && std::max(stats.forward,stats.reverse) <= input.tolerance && stats.normalAngle <= input.smoothAngle) break;
        if (network.patches.size()*4 > size_t(input.maxPatches)) {
            std::ostringstream message;
            message << "Mesh fit exceeds requested tolerance within patch budget: sampled deviation "
                << std::max(stats.forward,stats.reverse)*input.scale << " mm; smooth seam angle "
                << stats.normalAngle << " degrees" << (stats.oriented ? "" : "; surface faces away from the target")
                << (tree.get_child_optional("layout")
                    ? ". Increase the budget/tolerance or revise the quad layout."
                    : ". Try a different accuracy or patch budget; some meshes cannot be reconstructed.");
            throw std::runtime_error(message.str());
        }
        network = refine(network);
    }
    const auto shape = assemble(network,input);
    out << std::setprecision(17) << "{\"mode\":\"new\",\"participants\":[],\"results\":[";
    present(out,{shape,{},{}});
    out << "],\"fit\":{\"patches\":" << network.patches.size()
        << ",\"controlPoints\":" << network.controls.size()
        << ",\"sampledSurfaceToMesh\":" << stats.forward*input.scale
        << ",\"sampledMeshToSurface\":" << stats.reverse*input.scale
        << ",\"sampledRms\":" << stats.rms*input.scale
        << ",\"sampledSeamAngle\":" << stats.normalAngle
        << ",\"samples\":" << stats.samples;
    if (!tree.get_child_optional("layout")) {
        SurfaceSearch surface(network,12);
        out << ",\"vertexErrors\":[";
        for (size_t i = 0; i < input.target.vertices.size(); ++i) {
            const auto& p = input.target.vertices[i];
            if (i) out << ',';
            out << length(p-surface.closest(p).value.point)*input.scale;
        }
        out << ']';
    }
    out << "}}";
}
}
