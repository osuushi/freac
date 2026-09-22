#pragma once
#include "kernel.h"
struct FaceOffset { TopoDS_Face face; double distance; };
std::vector<FaceOffset> offsetContacts(const TopoDS_Shape&, const std::vector<TopoDS_Face>&, double);
