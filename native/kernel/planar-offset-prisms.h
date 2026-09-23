#pragma once
#include "kernel.h"
#include <optional>

std::optional<Result> planarOffsetPrisms(const Operand&, const std::vector<TopoDS_Face>&, double);
