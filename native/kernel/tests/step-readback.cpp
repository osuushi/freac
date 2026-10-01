#include <BRep_Tool.hxx>
#include <BRepAdaptor_Surface.hxx>
#include <BRepBndLib.hxx>
#include <BRepCheck_Analyzer.hxx>
#include <BRepGProp.hxx>
#include <Bnd_Box.hxx>
#include <GProp_GProps.hxx>
#include <Message.hxx>
#include <Message_Messenger.hxx>
#include <Poly_Triangulation.hxx>
#include <STEPControl_Reader.hxx>
#include <StepData_StepModel.hxx>
#include <TopExp_Explorer.hxx>
#include <TopoDS.hxx>
#include <iomanip>
#include <iostream>
#include <stdexcept>

namespace {
void inspect(std::ostream& out, const TopoDS_Shape& shape) {
    int exactFaces = 0, meshFaces = 0, cylinders = 0, triangles = 0;
    Bnd_Box bounds;
    double meshVolume = 0;
    for (TopExp_Explorer e(shape, TopAbs_FACE); e.More(); e.Next()) {
        const auto face = TopoDS::Face(e.Current());
        TopLoc_Location location;
        const auto mesh = BRep_Tool::Triangulation(face, location);
        if (!BRep_Tool::Surface(face).IsNull()) {
            ++exactFaces;
            if (BRepAdaptor_Surface(face).GetType() == GeomAbs_Cylinder) ++cylinders;
            BRepBndLib::AddOptimal(face, bounds, false, false);
            continue;
        }
        if (mesh.IsNull()) throw std::runtime_error("Missing imported geometry");
        ++meshFaces;
        const auto transform = location.Transformation();
        const auto origin = mesh->Node(1).Transformed(transform);
        for (int i = 1; i <= mesh->NbNodes(); ++i) bounds.Add(mesh->Node(i).Transformed(transform));
        for (int i = 1; i <= mesh->NbTriangles(); ++i) {
            int a, b, c; mesh->Triangle(i).Get(a, b, c);
            gp_Vec u(origin, mesh->Node(a).Transformed(transform));
            gp_Vec v(origin, mesh->Node(b).Transformed(transform));
            gp_Vec w(origin, mesh->Node(c).Transformed(transform));
            meshVolume += u.Dot(v.Crossed(w)) / 6;
            ++triangles;
        }
    }
    double lo[3], hi[3]; bounds.Get(lo[0], lo[1], lo[2], hi[0], hi[1], hi[2]);
    GProp_GProps properties;
    if (exactFaces) BRepGProp::VolumeProperties(shape, properties, 1e-10);
    out << "{\"exactFaces\":" << exactFaces << ",\"meshFaces\":" << meshFaces
        << ",\"cylinders\":" << cylinders << ",\"triangles\":" << triangles
        << ",\"meshVolume\":" << meshVolume << ",\"volume\":" << properties.Mass()
        << ",\"valid\":" << (exactFaces && BRepCheck_Analyzer(shape).IsValid() ? "true" : "false")
        << ",\"bounds\":[";
    for (int i = 0; i < 3; ++i) { if (i) out << ','; out << lo[i]; }
    for (int i = 0; i < 3; ++i) out << ',' << hi[i];
    out << "]}";
}
}

int main(int argc, char** argv) {
    try {
        if (argc != 2) throw std::runtime_error("Expected a STEP file path");
        Message::DefaultMessenger()->ChangePrinters().Clear();
        STEPControl_Reader reader;
        if (reader.ReadFile(argv[1]) != IFSelect_RetDone) throw std::runtime_error("STEP read failed");
        reader.SetSystemLengthUnit(1.0);
        if (reader.TransferRoots() < 1) throw std::runtime_error("STEP root transfer failed");
        std::cout << std::setprecision(17) << '[';
        for (int i = 1; i <= reader.NbShapes(); ++i) {
            if (i > 1) std::cout << ',';
            inspect(std::cout, reader.Shape(i));
        }
        std::cout << ']' << std::endl;
    } catch (const Standard_Failure& error) {
        std::cerr << error.GetMessageString() << std::endl; return 1;
    } catch (const std::exception& error) {
        std::cerr << error.what() << std::endl; return 1;
    }
}
