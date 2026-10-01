#include "kernel.h"
#include <DESTEP_Parameters.hxx>
#include <Message.hxx>
#include <Message_Messenger.hxx>
#include <STEPControl_Writer.hxx>
#include <StepData_StepModel.hxx>
#include <BRep_Builder.hxx>
#include <Poly_Triangulation.hxx>
#include <TopoDS_Shell.hxx>
#include <TopoDS_Solid.hxx>
#include <sstream>
#include <stdexcept>

namespace {
TopoDS_Shape meshShape(const Tree& input) {
    const auto& vertices = input.get_child("vertices");
    const auto& triangles = input.get_child("triangles");
    if (vertices.empty() || triangles.empty()) throw std::runtime_error("Empty STEP mesh");
    Handle(Poly_Triangulation) mesh = new Poly_Triangulation(
        static_cast<int>(vertices.size()), static_cast<int>(triangles.size()), false);
    int index = 1;
    for (const auto& vertex : vertices) mesh->SetNode(index++, point(vertex.second));
    index = 1;
    for (const auto& triangle : triangles) {
        if (triangle.second.size() != 3) throw std::runtime_error("Invalid STEP mesh triangle");
        int nodes[3], axis = 0;
        for (const auto& node : triangle.second) {
            const int value = node.second.get_value<int>();
            if (value < 0 || value >= mesh->NbNodes()) throw std::runtime_error("Invalid STEP mesh index");
            nodes[axis++] = value + 1;
        }
        mesh->SetTriangle(index++, Poly_Triangle(nodes[0], nodes[1], nodes[2]));
    }
    mesh->ComputeNormals();
    BRep_Builder builder;
    TopoDS_Face face; builder.MakeFace(face, mesh);
    TopoDS_Shell shell; builder.MakeShell(shell); builder.Add(shell, face); shell.Closed(true);
    TopoDS_Solid solid; builder.MakeSolid(solid); builder.Add(solid, shell);
    return solid;
}
}

void exportStep(std::ostream& out, const Tree& input) {
    const auto& items = input.get_child("items");
    if (items.empty()) throw std::runtime_error("Create or show a solid body first");
    // OCCT transfer progress must not enter the line-delimited JSON protocol.
    Message::DefaultMessenger()->ChangePrinters().Clear();
    STEPControl_Writer writer;
    DESTEP_Parameters parameters;
    parameters.WriteSchema = DESTEP_Parameters::WriteMode_StepSchema_AP242DIS;
    parameters.WriteUnit = UnitsMethods_LengthUnit_Millimeter;
    parameters.WriteAssembly = DESTEP_Parameters::WriteMode_Assembly_Off;
    parameters.WriteTessellated = DESTEP_Parameters::RWMode_Tessellated_OnNoBRep;
    writer.Model()->SetLocalLengthUnit(1.0);
    for (const auto& item : items) {
        const auto brep = item.second.get_optional<std::string>("brep");
        const auto shape = brep ? decode(*brep) : meshShape(item.second.get_child("mesh"));
        if (shape.ShapeType() != TopAbs_SOLID)
            throw std::runtime_error("STEP export requires a solid body");
        if (writer.Transfer(shape, STEPControl_AsIs, parameters) != IFSelect_RetDone)
            throw std::runtime_error("Could not transfer a solid to STEP");
    }
    std::ostringstream stream;
    if (writer.WriteStream(stream) != IFSelect_RetDone || !stream.good())
        throw std::runtime_error("Could not write STEP geometry");
    out << "{\"step\":" << quoted(stream.str()) << '}';
}
