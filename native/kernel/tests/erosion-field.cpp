#include "erosion-field.h"
#include <cmath>
#include <iostream>
#include <map>
#include <stdexcept>

namespace {
using namespace mesh_fit;
void require(bool condition,const char* message) {
    if (!condition) throw std::runtime_error(message);
}
void sphereContour(const V& center,const V& low) {
    const auto mesh = erosion::contourField(low,{4,4,4},0.25,
        [&](const V& p) { return 3-length(p-center); });
    require(!mesh.triangles.empty(),"Sphere contour must exist");
    std::map<Edge,std::pair<int,int>> uses;
    double volume = 0;
    for (const auto& f : mesh.triangles) {
        const auto a = mesh.vertices[f[0]], b = mesh.vertices[f[1]], c = mesh.vertices[f[2]];
        require(length((b-a).Crossed(c-a)) > 1e-12,"Contour triangles must have area");
        require((b-a).Crossed(c-a).Dot((a+b+c)/3-center) > 0,"Contour winding must be outward");
        volume += a.Dot(b.Crossed(c))/6;
        for (int i = 0; i < 3; ++i) {
            const int first = f[i], second = f[(i+1)%3];
            auto& count = uses[edge(first,second)];
            ++count.first; count.second += first < second ? 1 : -1;
        }
    }
    for (const auto& [edge,count] : uses)
        require(count.first == 2 && count.second == 0,"Every contour edge must be closed and oriented");
    for (const auto& p : mesh.vertices)
        require(std::abs(length(p-center)-3) < 0.01,"Contour lies near independent sphere distance");
    require(std::abs(volume/(36*std::acos(-1.0))-1) < 0.01,"Contour volume matches independent sphere");
}
void emptyAndBudget() {
    const auto empty = erosion::contourField({-1,-1,-1},{1,1,1},0.25,[](const V&) { return -1; });
    require(empty.vertices.empty() && empty.triangles.empty(),"Empty level set has no surface");
    bool rejected = false;
    try { erosion::contourField({-1,-1,-1},{1,1,1},1e-5,[](const V&) { return -1; }); }
    catch (const std::runtime_error&) { rejected = true; }
    require(rejected,"Oversized distance fields must reject before allocation");
    for (const double spacing : {0.0,-1.0,std::numeric_limits<double>::infinity()}) {
        rejected = false;
        try { erosion::contourField({-1,-1,-1},{1,1,1},spacing,[](const V&) { return -1; }); }
        catch (const std::runtime_error&) { rejected = true; }
        require(rejected,"Invalid spacing must reject before integer conversion");
    }
}
}
int main() {
    try {
        sphereContour({0.137,-0.213,0.079},{-4.371,-4.171,-4.271});
        sphereContour({0,0,0},{-4,-4,-4});
        emptyAndBudget();
        std::cout << "PASS interior contour winding, closed edges, independent distance/volume, empty result and budget\n";
    } catch (const std::exception& e) { std::cerr << e.what() << '\n'; return 1; }
}
