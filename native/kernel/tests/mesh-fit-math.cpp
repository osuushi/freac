#include "mesh-fit.h"
#include "mesh-fit-solve.h"
#include <cmath>
#include <iostream>
#include <stdexcept>

using namespace mesh_fit;
namespace {
void require(bool ok, const char* message) { if (!ok) throw std::runtime_error(message); }
Layout cube() {
    Layout c;
    c.vertices = {{-1,-1,-1},{1,-1,-1},{1,1,-1},{-1,1,-1},{-1,-1,1},{1,-1,1},{1,1,1},{-1,1,1}};
    c.quads = {{0,3,2,1},{4,5,6,7},{0,1,5,4},{1,2,6,5},{2,3,7,6},{3,0,4,7}};
    return c;
}
Mesh triangles(const Layout& c) {
    Mesh m; m.vertices = c.vertices;
    for (const auto& q : c.quads) { m.triangles.push_back({q[0],q[1],q[2]}); m.triangles.push_back({q[0],q[2],q[3]}); }
    return m;
}
void basisChecks() {
    for (int k = 0; k <= 100; ++k) {
        const auto b = basis(k/100.0), d = derivative(k/100.0);
        double sum = 0, derivativeSum = 0;
        for (int i = 0; i < 4; ++i) { sum += b[i]; derivativeSum += d[i]; }
        require(std::abs(sum-1) < 1e-14,"Partition of unity");
        require(std::abs(derivativeSum) < 1e-14,"Derivative partition of unity");
    }
}
void nearestChecks(const Search& s) {
    for (double x : {-3.0,-1.1,0.1,0.9,1.1,3.0}) for (double y : {-2.0,0.3,2.0}) {
        const auto hit = s.closest({x,y,2});
        const V expected(std::clamp(x,-1.0,1.0),std::clamp(y,-1.0,1.0),1);
        require(length(hit.point-expected) < 1e-12,"Nearest face, edge and corner witnesses");
    }
}
void normalChecks() {
    Mesh octahedron;
    octahedron.vertices = {{1,0,0},{0,1,0},{-1,0,0},{0,-1,0},{0,0,1},{0,0,-1}};
    octahedron.triangles = {{0,1,4},{1,2,4},{2,3,4},{3,0,4},
        {1,0,5},{2,1,5},{3,2,5},{0,3,5}};
    Search smooth(octahedron,true), sharp(octahedron);
    require(length(smooth.closest({2,0,0}).normal-V(1,0,0)) < 1e-12,
        "Smooth vertex normals must cross steep triangle angles on coarse curved targets");
    require(sharp.closest({2,0,0}).normal.Dot(V(1,0,0)) < 0.6,
        "Feature-preserving normals must retain separate sides at a sharp corner");
}
void refinementChecks(Network n) {
    // Perturb interior controls so preservation is tested on nonplanar bicubic surfaces.
    for (const auto& p : n.patches) n.controls[p.controls[5]] += V(0.07,-0.11,0.19);
    const auto finer = refine(n);
    require(finer.patches.size() == n.patches.size()*4,"Refinement count");
    const double offsets[4][2] = {{0,0},{0.5,0},{0.5,0.5},{0,0.5}};
    for (size_t f = 0; f < n.patches.size(); ++f) for (int q = 0; q < 4; ++q)
        for (int i = 0; i <= 8; ++i) for (int j = 0; j <= 8; ++j) {
            const double u = i/8.0, v = j/8.0;
            const auto a = evaluate(n,int(f),offsets[q][0]+u/2,offsets[q][1]+v/2);
            const auto b = evaluate(finer,int(f)*4+q,u,v);
            require(length(a.point-b.point) < 1e-12,"De Casteljau refinement must preserve surface");
            require(length(a.du/2-b.du) < 1e-12 && length(a.dv/2-b.dv) < 1e-12,"Refined derivatives");
        }
}
void solverChecks() {
    const std::vector<Row> rows = {{{{0,2},{1,1}},7},{{{0,1},{1,-1}},-1},{{{1,3}},9}};
    const auto x = leastSquares(rows,{0,0});
    require(std::abs(x[0]-2) < 1e-4 && std::abs(x[1]-3) < 1e-4,"Sparse least squares known solution");
}
}
int main() {
    try {
        basisChecks(); solverChecks(); normalChecks();
        auto c = cube(); const auto m = triangles(c); Search s(m); nearestChecks(s);
        for (const auto& q : c.quads) for (int i = 0; i < 4; ++i) c.creases.insert(edge(q[i],q[(i+1)%4]));
        const auto n = initialize(c,s); refinementChecks(n);
        SurfaceSearch smooth(n,8);
        require(length(smooth.closest({0.3,0.4,2}).value.point-V(0.3,0.4,1)) < 1e-12,"Surface projection");
        std::cout << "PASS mesh fit basis, nearest points, joint solve, subdivision invariance and surface projection\n";
    } catch (const std::exception& e) { std::cerr << e.what() << '\n'; return 1; }
}
