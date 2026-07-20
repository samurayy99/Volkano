"""Independent standard-library audit for the exported LENOX v005 GLB."""

from __future__ import annotations

import json
import math
from pathlib import Path
import struct
import sys


PROJECT_ROOT = Path(__file__).resolve().parents[2]
GLB_PATH = PROJECT_ROOT / "public/models/lenox/lenox-v005.glb"
REPORT_PATH = PROJECT_ROOT / "artifacts/lenox-blender/v005/lenox-v005-verification.json"

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
    if len(payload) < 20:
        raise ValueError("GLB is truncated")
    magic, version, length = struct.unpack_from("<4sII", payload, 0)
    if magic != b"glTF" or version != 2 or length != len(payload):
        raise ValueError("invalid GLB header")
    offset = 12
    gltf = None
    binary = b""
    while offset < len(payload):
        if offset + 8 > len(payload):
            raise ValueError("truncated GLB chunk header")
        chunk_length, chunk_type = struct.unpack_from("<II", payload, offset)
        offset += 8
        end = offset + chunk_length
        if end > len(payload):
            raise ValueError("GLB chunk exceeds file")
        chunk = payload[offset:end]
        offset = end
        if chunk_type == 0x4E4F534A:
            gltf = json.loads(chunk.decode("utf-8"))
        elif chunk_type == 0x004E4942:
            binary = chunk
    if gltf is None:
        raise ValueError("GLB JSON chunk missing")
    return gltf, binary


def reference_ok(index: object, values: list) -> bool:
    return isinstance(index, int) and 0 <= index < len(values)


def image_dimensions(data: bytes) -> tuple[int, int] | None:
    if data[:8] == b"\x89PNG\r\n\x1a\n" and data[12:16] == b"IHDR":
        return struct.unpack(">II", data[16:24])
    if data[:2] == b"\xff\xd8":
        offset = 2
        while offset + 9 < len(data):
            if data[offset] != 0xFF:
                offset += 1
                continue
            marker = data[offset + 1]
            if marker in (0xC0, 0xC1, 0xC2):
                return struct.unpack(">HH", data[offset + 5:offset + 9])[::-1]
            if offset + 4 > len(data):
                break
            length = struct.unpack(">H", data[offset + 2:offset + 4])[0]
            offset += 2 + length
    return None


def accessor_values(gltf: dict, binary: bytes, accessor_index: int):
    accessor = gltf["accessors"][accessor_index]
    if "sparse" in accessor or "bufferView" not in accessor:
        return
    view = gltf["bufferViews"][accessor["bufferView"]]
    code, scalar_size = COMPONENTS[accessor["componentType"]]
    width = TYPE_WIDTH[accessor["type"]]
    packed_size = scalar_size * width
    stride = view.get("byteStride", packed_size)
    start = view.get("byteOffset", 0) + accessor.get("byteOffset", 0)
    unpack = struct.Struct("<" + code * width).unpack_from
    for index in range(accessor["count"]):
        yield unpack(binary, start + index * stride)


def audit() -> dict:
    gltf, binary = read_glb(GLB_PATH)
    failures: list[str] = []
    accessors = gltf.get("accessors", [])
    views = gltf.get("bufferViews", [])
    buffers = gltf.get("buffers", [])
    meshes = gltf.get("meshes", [])
    nodes = gltf.get("nodes", [])
    materials = gltf.get("materials", [])
    images = gltf.get("images", [])
    textures = gltf.get("textures", [])
    animations = gltf.get("animations", [])

    if len(buffers) != 1 or buffers[0].get("byteLength", 0) > len(binary):
        failures.append("binary buffer length is invalid")

    for index, view in enumerate(views):
        if view.get("buffer") != 0:
            failures.append(f"bufferView {index} does not reference embedded buffer 0")
            continue
        start = view.get("byteOffset", 0)
        length = view.get("byteLength", 0)
        if not isinstance(start, int) or not isinstance(length, int) or start < 0 or length < 0 or start + length > len(binary):
            failures.append(f"bufferView {index} is out of bounds")

    non_finite_accessors = []
    for index, accessor in enumerate(accessors):
        component_type = accessor.get("componentType")
        accessor_type = accessor.get("type")
        count = accessor.get("count")
        if component_type not in COMPONENTS or accessor_type not in TYPE_WIDTH or not isinstance(count, int) or count < 0:
            failures.append(f"accessor {index} has invalid format")
            continue
        if "sparse" in accessor:
            failures.append(f"sparse accessor {index} is unsupported by the runtime contract")
            continue
        if "bufferView" not in accessor or not reference_ok(accessor["bufferView"], views):
            failures.append(f"accessor {index} has invalid bufferView")
            continue
        view = views[accessor["bufferView"]]
        _, scalar_size = COMPONENTS[component_type]
        packed_size = scalar_size * TYPE_WIDTH[accessor_type]
        stride = view.get("byteStride", packed_size)
        if not isinstance(stride, int) or stride < packed_size or stride % scalar_size:
            failures.append(f"accessor {index} has invalid byteStride")
            continue
        required = accessor.get("byteOffset", 0) + (count - 1) * stride + packed_size if count else 0
        if required > view.get("byteLength", 0):
            failures.append(f"accessor {index} exceeds its bufferView")
            continue
        if component_type == 5126 and any(
            not math.isfinite(value)
            for row in accessor_values(gltf, binary, index) or ()
            for value in row
        ):
            non_finite_accessors.append(index)
    if non_finite_accessors:
        failures.append(f"non-finite float accessors: {non_finite_accessors}")

    triangles = 0
    primitive_count = 0
    morph_targets: set[str] = set()
    mesh_names: set[str] = set()
    for mesh_index, mesh in enumerate(meshes):
        mesh_names.add(mesh.get("name", ""))
        morph_targets.update(mesh.get("extras", {}).get("targetNames", []))
        for primitive_index, primitive in enumerate(mesh.get("primitives", [])):
            primitive_count += 1
            if primitive.get("mode", 4) != 4:
                failures.append(f"mesh {mesh_index} primitive {primitive_index} is not triangles")
                continue
            if not reference_ok(primitive.get("material", 0), materials):
                failures.append(f"mesh {mesh_index} primitive {primitive_index} has invalid material")
            attributes = primitive.get("attributes", {})
            if not reference_ok(attributes.get("POSITION"), accessors):
                failures.append(f"mesh {mesh_index} primitive {primitive_index} has invalid POSITION")
                continue
            if "indices" in primitive:
                if not reference_ok(primitive["indices"], accessors):
                    failures.append(f"mesh {mesh_index} primitive {primitive_index} has invalid indices")
                    continue
                count = accessors[primitive["indices"]].get("count", 0)
            else:
                count = accessors[attributes["POSITION"]].get("count", 0)
            if count % 3:
                failures.append(f"mesh {mesh_index} primitive {primitive_index} index count is not divisible by 3")
            triangles += count // 3
            for target in primitive.get("targets", []):
                for semantic, accessor_index in target.items():
                    if semantic not in {"POSITION", "NORMAL", "TANGENT"} or not reference_ok(accessor_index, accessors):
                        failures.append(f"mesh {mesh_index} primitive {primitive_index} has invalid morph target")

    node_names = {node.get("name", "") for node in nodes}
    for index, node in enumerate(nodes):
        if "mesh" in node and not reference_ok(node["mesh"], meshes):
            failures.append(f"node {index} has invalid mesh")
        if "skin" in node and not reference_ok(node["skin"], gltf.get("skins", [])):
            failures.append(f"node {index} has invalid skin")
        for child in node.get("children", []):
            if not reference_ok(child, nodes):
                failures.append(f"node {index} has invalid child")

    dimensions = []
    for index, image in enumerate(images):
        view_index = image.get("bufferView")
        if not reference_ok(view_index, views):
            failures.append(f"image {index} is not an embedded valid bufferView")
            dimensions.append(None)
            continue
        view = views[view_index]
        start = view.get("byteOffset", 0)
        end = start + view.get("byteLength", 0)
        dimensions.append(image_dimensions(binary[start:end]))
    for index, texture in enumerate(textures):
        if not reference_ok(texture.get("source"), images):
            failures.append(f"texture {index} has invalid source")
        if "sampler" in texture and not reference_ok(texture["sampler"], gltf.get("samplers", [])):
            failures.append(f"texture {index} has invalid sampler")

    for animation_index, animation in enumerate(animations):
        samplers = animation.get("samplers", [])
        for sampler_index, sampler in enumerate(samplers):
            if not reference_ok(sampler.get("input"), accessors) or not reference_ok(sampler.get("output"), accessors):
                failures.append(f"animation {animation_index} sampler {sampler_index} is invalid")
        for channel_index, channel in enumerate(animation.get("channels", [])):
            if not reference_ok(channel.get("sampler"), samplers):
                failures.append(f"animation {animation_index} channel {channel_index} has invalid sampler")
            target_node = channel.get("target", {}).get("node")
            if not reference_ok(target_node, nodes):
                failures.append(f"animation {animation_index} channel {channel_index} has invalid node")

    extensions = set(gltf.get("extensionsUsed", [])) | set(gltf.get("extensionsRequired", []))
    forbidden_extensions = {"KHR_draco_mesh_compression", "EXT_meshopt_compression"}
    if extensions & forbidden_extensions:
        failures.append("forbidden compressed mesh extension present")

    required_nodes = {"Root", "Head", "Eye.L", "Eye.R", "Fin.L", "Fin.R", "LENOX_FACE_ANCHOR"}
    missing_nodes = sorted(required_nodes - node_names)
    if missing_nodes:
        failures.append(f"missing runtime nodes: {missing_nodes}")
    chain_prefixes = {
        "Arm_Lead_L_", "Arm_Lead_R_", "Arm_Support_Front_L_", "Arm_Support_Front_R_",
        "Arm_Support_Side_L_", "Arm_Support_Side_R_",
    }
    missing_chains = sorted(prefix for prefix in chain_prefixes if not any(name.startswith(prefix) for name in node_names))
    if missing_chains:
        failures.append(f"missing primary chains: {missing_chains}")
    required_shapes = {"Concerned", "Confirm", "Thinking"}
    if not required_shapes <= morph_targets:
        failures.append(f"missing morph targets: {sorted(required_shapes - morph_targets)}")
    arm_meshes = sorted(name for name in mesh_names if name.startswith("LENOX_Arm_"))
    if len(arm_meshes) != 8:
        failures.append(f"expected eight visible arm meshes, found {len(arm_meshes)}")
    for secondary in ("LENOX_Arm_Secondary_Rear_L", "LENOX_Arm_Secondary_Rear_R"):
        if not any(name.startswith(secondary) for name in mesh_names):
            failures.append(f"missing secondary visible arm {secondary}")

    animation_names = [animation.get("name", "") for animation in animations]
    if not animations:
        failures.append("animation test missing")
    if any(name.startswith("Key") or "KeyAction" in name for name in animation_names):
        failures.append(f"unintended generic key actions exported: {animation_names}")
    if len(gltf.get("skins", [])) != 1:
        failures.append("expected exactly one skin")
    if GLB_PATH.stat().st_size >= 3_000_000:
        failures.append("GLB is 3 MB or larger")
    if triangles >= 60_000:
        failures.append("GLB has 60k or more triangles")
    if len(materials) > 8:
        failures.append("more than eight materials")
    if len(textures) > 4:
        failures.append("more than four textures")
    if primitive_count > 20:
        failures.append("more than twenty primitives/draw-call estimate")
    if any(size is None or max(size) > 512 for size in dimensions):
        failures.append(f"invalid or oversized embedded textures: {dimensions}")

    result = {
        "pass": not failures,
        "failures": failures,
        "glb_bytes": GLB_PATH.stat().st_size,
        "exported_triangles": triangles,
        "node_count": len(nodes),
        "mesh_count": len(meshes),
        "primitive_draw_call_estimate": primitive_count,
        "material_count": len(materials),
        "texture_count": len(textures),
        "texture_dimensions": dimensions,
        "skin_count": len(gltf.get("skins", [])),
        "animation_count": len(animations),
        "animation_names": animation_names,
        "morph_targets": sorted(morph_targets),
        "visible_arm_meshes": arm_meshes,
        "primary_chain_prefixes": sorted(chain_prefixes),
        "forbidden_compression_extensions_present": sorted(extensions & forbidden_extensions),
        "non_finite_float_accessors": non_finite_accessors,
    }
    REPORT_PATH.parent.mkdir(parents=True, exist_ok=True)
    REPORT_PATH.write_text(json.dumps(result, indent=2) + "\n", encoding="utf-8")
    return result


if __name__ == "__main__":
    verification = audit()
    print(json.dumps(verification, indent=2))
    sys.exit(0 if verification["pass"] else 1)
