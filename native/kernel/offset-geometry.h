#pragma once
#include "kernel.h"

// Shared numerical geometry checks for Shell and freeform Face Offset.
namespace offset_geometry {
constexpr double tolerance = 1e-6;
constexpr double shapeTolerance = 0.001;
bool freeform(const TopoDS_Shape& shape);
std::string encoding(const TopoDS_Shape& shape);
Operand prepare(const Operand& source, const char* context,
                std::vector<TopoDS_Face>* selected = nullptr, bool forceCopy = false);
void checkParallel(const TopoDS_Face& source, const TopoDS_Face& offset, double distance,
                   const char* context, bool preserveOrientation = false);
void validSolid(const TopoDS_Shape& shape, const char* context);
void rebuildBoundaries(const TopoDS_Shape& shape, const TopoDS_Shape& source);
}
