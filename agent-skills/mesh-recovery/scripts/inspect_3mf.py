"""Inspect a main-model 3MF with the Python standard library; never extract files."""
from __future__ import annotations
import json
import math
from pathlib import PurePosixPath
import sys
from typing import Any
import xml.etree.ElementTree as ET
import zipfile

UNITS = {"micron": .001, "millimeter": 1., "centimeter": 10., "inch": 25.4, "foot": 304.8, "meter": 1000.}
IDENTITY = [1., 0., 0., 0., 1., 0., 0., 0., 1., 0., 0., 0.]

def transform(point: list[float], value: str | None) -> list[float]:
    matrix = [float(v) for v in value.split()] if value else IDENTITY
    if len(matrix) != 12 or not all(math.isfinite(v) for v in matrix):
        raise ValueError("Invalid 3MF transform")
    return [sum(point[k] * matrix[3*k+j] for k in range(3)) + matrix[9+j] for j in range(3)]

def inspect(path: str) -> dict[str, Any]:
    with zipfile.ZipFile(path) as archive:
        models = [n for n in archive.namelist() if n.lower() == "3d/3dmodel.model"]
        if len(models) != 1:
            raise ValueError("Unsupported main model location; inspect package relationships first")
        info = archive.getinfo(models[0])
        if info.file_size > 64 * 1024 * 1024:
            raise ValueError("Model XML exceeds the 64 MiB inspection limit")
        data = archive.read(info)
        if b"<!DOCTYPE" in data.upper() or b"<!ENTITY" in data.upper():
            raise ValueError("XML declarations with entities are unsupported")
        root = ET.fromstring(data)
    namespace = root.tag.split("}")[0] + "}"
    unit = root.get("unit", "millimeter")
    if unit not in UNITS:
        raise ValueError(f"Unsupported unit: {unit}")
    objects = {o.get("id"): o for o in root.findall(f"{namespace}resources/{namespace}object")}
    result: list[dict[str, Any]] = []
    def visit(item: ET.Element, parents: list[ET.Element], active: set[str]) -> None:
        if any(k.endswith("}path") for k in item.attrib):
            raise ValueError("External component models require extension-aware inspection")
        key = item.get("objectid", "")
        if key in active or len(active) > 64 or key not in objects:
            raise ValueError("Invalid or recursive component reference")
        obj = objects[key]
        components = obj.find(f"{namespace}components")
        chain = [item, *parents]
        if components is not None:
            for child in components:
                visit(child, chain, active | {key})
            return
        vertices = [[float(v.get(axis, "nan")) for axis in ("x", "y", "z")]
                    for v in obj.findall(f"{namespace}mesh/{namespace}vertices/{namespace}vertex")]
        triangles = [[int(t.get(axis, "-1")) for axis in ("v1", "v2", "v3")]
                     for t in obj.findall(f"{namespace}mesh/{namespace}triangles/{namespace}triangle")]
        if not vertices or not triangles or not all(math.isfinite(v) for p in vertices for v in p):
            raise ValueError("Missing or invalid mesh geometry")
        edges: dict[tuple[int, int], tuple[int, int]] = {}
        for triangle in triangles:
            if len(set(triangle)) != 3 or any(i < 0 or i >= len(vertices) for i in triangle):
                raise ValueError("Invalid triangle indices")
            for a, b in zip(triangle, triangle[1:] + triangle[:1]):
                edge = (min(a, b), max(a, b))
                count, direction = edges.get(edge, (0, 0))
                edges[edge] = (count + 1, direction + (1 if a < b else -1))
        points = vertices
        for node in chain:
            points = [transform(p, node.get("transform")) for p in points]
        bounds = [[fn(p[axis] for p in points) * UNITS[unit] for axis in range(3)] for fn in (min, max)]
        result.append({"name": obj.get("name", f"Object {key}"), "object_id": key,
                       "vertices": len(vertices), "triangles": len(triangles), "bounds_mm": bounds,
                       "closed_oriented_by_indices": all(v == (2, 0) for v in edges.values()),
                       "transforms_inner_to_outer": [n.get("transform") for n in chain]})
    for item in root.findall(f"{namespace}build/{namespace}item"):
        visit(item, [], set())
    if not result:
        raise ValueError("No printable mesh instances found")
    return {"file": PurePosixPath(path).name, "source_unit": unit, "parts": result,
            "note": "Topology by shared indices only; no solid, self-intersection, fit or strength validation."}

if __name__ == "__main__":
    print(json.dumps(inspect(sys.argv[1]), indent=2))
