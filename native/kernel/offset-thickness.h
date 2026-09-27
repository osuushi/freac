#pragma once
#include <TopoDS_Face.hxx>
#include <TopTools_IndexedMapOfShape.hxx>
#include <ostream>

void presentOffsetThickness(std::ostream&, const TopoDS_Face&,
                            const TopTools_IndexedMapOfShape&, const TopoDS_Shape&);
