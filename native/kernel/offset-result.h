#pragma once
#include "offset-contacts.h"
class BRepOffset_MakeOffset;

void checkFreeformOffset(const Operand& body, BRepOffset_MakeOffset& operation,
                        const std::vector<FaceOffset>& offsets);
