#include "mesh-fit.h"
#include <cmath>

namespace mesh_fit {
Layout automaticLayout(const Mesh& target,int budget) {
    const auto sphere = sphereMap(target);
    Search search(sphere,true);
    const int resolution = std::max(1,int(std::sqrt(budget/6.0)));
    Layout layout;
    const std::array<V,8> corners{{{-1,-1,-1},{1,-1,-1},{1,1,-1},{-1,1,-1},
        {-1,-1,1},{1,-1,1},{1,1,1},{-1,1,1}}};
    const std::array<Quad,6> faces{{{0,3,2,1},{4,5,6,7},{0,1,5,4},{1,2,6,5},{2,3,7,6},{3,0,4,7}}};
    std::map<std::array<int,3>,int> indexes;
    for (const auto& face : faces) {
        std::vector<int> grid;
        for (int i = 0; i <= resolution; ++i) for (int j = 0; j <= resolution; ++j) {
            const double u = double(i)/resolution, v = double(j)/resolution;
            const auto p = corners[face[0]]*((1-u)*(1-v))+corners[face[1]]*(u*(1-v))+
                corners[face[2]]*(u*v)+corners[face[3]]*((1-u)*v);
            const std::array<int,3> key{int(std::round(p.X()*resolution)),int(std::round(p.Y()*resolution)),int(std::round(p.Z()*resolution))};
            if (!indexes.contains(key)) {
                const auto hit = search.closest(unit(p));
                const auto& triangle = target.triangles[hit.triangle];
                V position;
                for (int k = 0; k < 3; ++k) position += target.vertices[triangle[k]]*hit.weights[k];
                indexes[key] = int(layout.vertices.size()); layout.vertices.push_back(position);
            }
            grid.push_back(indexes.at(key));
        }
        for (int i = 0; i < resolution; ++i) for (int j = 0; j < resolution; ++j) {
            const int a = i*(resolution+1)+j, b = (i+1)*(resolution+1)+j;
            layout.quads.push_back({grid[a],grid[b],grid[b+1],grid[a+1]});
        }
    }
    return layout;
}
}
