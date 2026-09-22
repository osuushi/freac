// Test-fixture generator, using Freac's own serialization and presentation code.
#define main freacKernelServiceMain
#include "../../native/kernel/main.cpp"
#undef main
#include <BRepPrimAPI_MakeCylinder.hxx>
int main() {
    std::cout << std::setprecision(17);
    present(std::cout, {BRepPrimAPI_MakeCylinder(10, 5).Shape(), {}, {}});
}
