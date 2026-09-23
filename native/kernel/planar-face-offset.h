#pragma once
#include "kernel.h"
#include <optional>

std::optional<Result> planarFaceOffset(const Operand&, const std::vector<TopoDS_Face>&, double);
