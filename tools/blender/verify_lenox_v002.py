"""Independent standard-library verification for the exported LENOX v002 GLB."""

from __future__ import annotations

import json
import math
import struct
import sys
from pathlib import Path


PROJECT_ROOT = Path(__file__).resolve().parents[2]
GLB_PATH = PROJECT_ROOT / "public/models/lenox/lenox-v002.glb"
REPORT_PATH = PROJECT_ROOT / "artifacts/lenox-blender/v002/lenox-v002-verification.json"

COMPONENTS = {
    5120: ("b", 1),
    5121: ("B", 1),
    5122: ("h", 2),
    5123: ("H", 2),
    5125: ("I", 4),
    5126: ("f", 4),
}
TYPE_WIDTH = {
    "SCALAR": 1,
    "VEC2": 2,
    "VEC3": 3,
    "VEC4": 4,
    "MAT2": 4,
    "MAT3": 9,
    "MAT4": 16,
}


def read_glb(path: Path) -> tuple[dict, bytes]:
    payload = path.read_bytes()
    magic, version, length = struct.unpack_from("<4sII", payload, 0)
    if magic != b"glTF" or version != 2 or length != len(payload):
        raise ValueError("invalid GLB header")
    offset = 12
    gltf = None
    binary = b""
    while offset < len(payload):
        chunk_length, chunk_type = struct.unpack_from("<II", payload, offset)
        offset += 8
        chunk = payload[offset:offset + chunk_length]
        offset += chunk_length
        if chunk_type == 0x4E4F534A:
            gltf = json.loads(chunk.decode("utf-8"))
        elif chunk_type == 0x004E4942:
            binary = chunk
    if gltf is None:
        raise ValueError("GLB JSON chunk missing")
    return gltf, binary


def accessor_values(gltf: dict, binary: bytes, accessor_index: int):
    accessor = gltf["accessors"][accessor_index]
    if "sparse" in accessor:
        raise ValueError(f"sparse accessor {accessor_index} is not supported by this verifier")
    view = gltf["bufferViews"][accessor["bufferView"]]
    code, scalar_size = COMPONENTS[accessor["componentType"]]
    width = TYPE_WIDTH[accessor["type"]]
    packed_size = scalar_size * width
    stride = view.get("byteStride", packed_size)
    start = view.get("byteOffset", 0) + accessor.get("byteOffset", 0)
    unpack = struct.Struct("<" + code * width).unpack_from
    for index in range(accessor["count"]):
        yield unpack(binary, start + index * stride)


def png_dimensions(data: bytes) -> tuple[int, int] | None:
    if data[:8] != b"\x89PNG\r\n\x1a\n" or data[12:16] != b"IHDR":
        return None
    return struct.unpack(">II", data[16:24])


def embedded_image_dimensions(gltf: dict, binary: bytes) -> list[tuple[int, int] | None]:
    dimensions = []
    for image in gltf.get("images", []):
        view = gltf["bufferViews"][image["bufferView"]]
        start = view.get("byteOffset", 0)
        end = start + view["byteLength"]
        dimensions.append(png_dimensions(binary[start:end]))
    return dimensions


def verify() -> dict:
    gltf, binary = read_glb(GLB_PATH)
    failures = []
    extensions = set(gltf.get("extensionsUsed", [])) | set(gltf.get("extensionsRequired", []))
    forbidden_extensions = {"KHR_draco_mesh_compression", "EXT_meshopt_compression"}
    if extensions & forbidden_extensions:
        failures.append("compressed mesh extension present")

    triangles = 0
    target_names = set()
    for mesh in gltf.get("meshes", []):
        target_names.update(mesh.get("extras", {}).get("targetNames", []))
        for primitive in mesh.get("primitives", []):
            if primitive.get("mode", 4) != 4:
                failures.append("non-triangle primitive present")
                continue
            count = (
                gltf["accessors"][primitive["indices"]]["count"]
                if "indices" in primitive
                else gltf["accessors"][primitive["attributes"]["POSITION"]]["count"]
            )
            triangles += count // 3

    non_finite_accessors = []
    for accessor_index, accessor in enumerate(gltf.get("accessors", [])):
        if accessor["componentType"] != 5126:
            continue
        if any(not math.isfinite(value) for row in accessor_values(gltf, binary, accessor_index) for value in row):
            non_finite_accessors.append(accessor_index)
    if non_finite_accessors:
        failures.append(f"non-finite float accessors: {non_finite_accessors}")

    node_names = {node.get("name", "") for node in gltf.get("nodes", [])}
    chain_prefixes = {
        "Arm_Lead_L_",
        "Arm_Lead_R_",
        "Arm_Support_Front_L_",
        "Arm_Support_Front_R_",
        "Arm_Support_Side_L_",
        "Arm_Support_Side_R_",
    }
    missing_chains = [
        prefix for prefix in sorted(chain_prefixes)
        if not any(name.startswith(prefix) for name in node_names)
    ]
    if missing_chains:
        failures.append(f"missing primary chains: {missing_chains}")

    required_shapes = {"Concerned", "Confirm", "Thinking"}
    if not required_shapes <= target_names:
        failures.append(f"missing morph targets: {sorted(required_shapes - target_names)}")

    dimensions = embedded_image_dimensions(gltf, binary)
    if any(size is None or max(size) > 512 for size in dimensions):
        failures.append(f"invalid or oversized embedded textures: {dimensions}")
    if GLB_PATH.stat().st_size >= 3_000_000:
        failures.append("GLB is 3 MB or larger")
    if triangles >= 60_000:
        failures.append("GLB has 60k or more exported triangles")
    if len(gltf.get("skins", [])) != 1:
        failures.append("expected exactly one exported skin")
    if not gltf.get("animations"):
        failures.append("animation test was not exported")

    result = {
        "pass": not failures,
        "failures": failures,
        "glb_bytes": GLB_PATH.stat().st_size,
        "exported_triangles": triangles,
        "mesh_count": len(gltf.get("meshes", [])),
        "material_count": len(gltf.get("materials", [])),
        "texture_count": len(gltf.get("textures", [])),
        "texture_dimensions": dimensions,
        "skin_count": len(gltf.get("skins", [])),
        "animation_count": len(gltf.get("animations", [])),
        "morph_targets": sorted(target_names),
        "primary_chain_prefixes": sorted(chain_prefixes),
        "forbidden_compression_extensions_present": sorted(extensions & forbidden_extensions),
        "non_finite_float_accessors": non_finite_accessors,
    }
    REPORT_PATH.parent.mkdir(parents=True, exist_ok=True)
    REPORT_PATH.write_text(json.dumps(result, indent=2) + "\n", encoding="utf-8")
    return result


if __name__ == "__main__":
    verification = verify()
    print(json.dumps(verification, indent=2))
    sys.exit(0 if verification["pass"] else 1)
