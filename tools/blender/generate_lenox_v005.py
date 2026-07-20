"""Generate the visually converged, technically compatible LENOX v005 asset.

The v002-v004 generators and artifacts are frozen. This generator imports the
unchanged v004 scene as a rig/name contract, then replaces only v005-owned
visible geometry, materials, weights and the export test action.

Canonical command (Blender 3.6.23):
  blender --background --factory-startup --gpu-backend opengl \
    --python tools/blender/generate_lenox_v005.py
"""

from __future__ import annotations

from array import array
import hashlib
import importlib.util
import json
import math
from pathlib import Path
import sys

import bpy
from mathutils import Vector


MODULE_PATH = Path(__file__).with_name("generate_lenox_v004.py")
SPEC = importlib.util.spec_from_file_location("lenox_v004_frozen", MODULE_PATH)
if SPEC is None or SPEC.loader is None:
    raise RuntimeError(f"Could not load frozen v004 generator from {MODULE_PATH}")
v004 = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(v004)
base = v004.base

PROJECT_ROOT = Path(__file__).resolve().parents[2]
BLEND_PATH = PROJECT_ROOT / "assets/lenox/lenox-v005.blend"
GLB_PATH = PROJECT_ROOT / "public/models/lenox/lenox-v005.glb"
ARTIFACT_DIR = PROJECT_ROOT / "artifacts/lenox-blender/v005"
REPORT_PATH = ARTIFACT_DIR / "lenox-v005-report.json"
LANDMARK_PATH = ARTIFACT_DIR / "lenox-v005-landmarks.json"
BASE_COLOR_PATH = PROJECT_ROOT / "assets/lenox/textures/lenox-v005-basecolor.png"
NORMAL_PATH = PROJECT_ROOT / "assets/lenox/textures/lenox-v005-normal.png"
ROUGHNESS_PATH = PROJECT_ROOT / "assets/lenox/textures/lenox-v005-roughness.png"
IRIS_PATH = PROJECT_ROOT / "assets/lenox/textures/lenox-v005-iris.png"

base.BLEND_PATH = BLEND_PATH
base.GLB_PATH = GLB_PATH
base.ARTIFACT_DIR = ARTIFACT_DIR
base.REPORT_PATH = REPORT_PATH
base.NORMAL_PATH = NORMAL_PATH
base.ROUGHNESS_PATH = ROUGHNESS_PATH

V004_BLEND_SHA256 = "6f6df45a268066b58bbd118643c711696dac5c771d45e291c9c9a1abb0077aa6"
V004_GLB_SHA256 = "0427e499cc9b38c85bb6e55a9ccf6251fc2034e118b88539beb2cca851289e60"

TEXTURE_IMAGES: dict[str, bpy.types.Image] = {}


ARM_SPECS_V005 = (
    {
        "name": "Lead_L", "role": "lead", "chain": "Lead_L", "depth": 0.38,
        "points": [(-0.38, -0.28, 1.72), (-0.65, -0.78, 1.28), (-0.92, -1.10, 0.72),
                   (-1.00, -1.22, 0.18), (-0.82, -1.30, -0.02), (-0.49, -1.33, 0.05),
                   (-0.30, -1.34, 0.32), (-0.43, -1.35, 0.55)],
        "radii": [1.48, 1.38, 1.18, 0.88, 0.62, 0.40, 0.23, 0.12],
    },
    {
        "name": "Lead_R", "role": "lead", "chain": "Lead_R", "depth": 0.39,
        "points": [(0.34, -0.32, 1.72), (0.58, -0.82, 1.31), (0.82, -1.13, 0.76),
                   (0.86, -1.25, 0.22), (0.67, -1.34, 0.00), (0.35, -1.37, 0.10),
                   (0.19, -1.37, 0.38), (0.34, -1.38, 0.58)],
        "radii": [1.50, 1.39, 1.17, 0.86, 0.59, 0.38, 0.22, 0.12],
    },
    {
        "name": "Support_Front_L", "role": "support", "chain": "Support_Front_L", "depth": 0.33,
        "points": [(-0.78, -0.06, 1.59), (-1.17, -0.48, 1.18), (-1.55, -0.79, 0.70),
                   (-1.72, -0.95, 0.29), (-1.62, -1.07, 0.04), (-1.34, -1.13, 0.06),
                   (-1.16, -1.16, 0.27), (-1.27, -1.17, 0.44)],
        "radii": [1.34, 1.23, 1.02, 0.76, 0.52, 0.33, 0.19, 0.10],
    },
    {
        "name": "Support_Front_R", "role": "support", "chain": "Support_Front_R", "depth": 0.32,
        "points": [(0.80, -0.02, 1.57), (1.22, -0.42, 1.18), (1.64, -0.69, 0.73),
                   (1.87, -0.83, 0.35), (1.84, -0.98, 0.10), (1.60, -1.07, 0.08),
                   (1.40, -1.10, 0.29), (1.51, -1.10, 0.48)],
        "radii": [1.32, 1.21, 1.00, 0.74, 0.49, 0.31, 0.18, 0.10],
    },
    {
        "name": "Support_Side_L", "role": "support", "chain": "Support_Side_L", "depth": 0.34,
        "points": [(-1.08, 0.24, 1.51), (-1.62, 0.03, 1.18), (-2.16, -0.25, 0.82),
                   (-2.52, -0.48, 0.50), (-2.64, -0.64, 0.30), (-2.60, -0.70, 0.69),
                   (-2.42, -0.72, 1.17), (-2.16, -0.73, 1.42), (-1.98, -0.74, 1.22)],
        "radii": [1.30, 1.20, 1.02, 0.79, 0.58, 0.40, 0.25, 0.15, 0.09],
    },
    {
        "name": "Support_Side_R", "role": "support", "chain": "Support_Side_R", "depth": 0.35,
        "points": [(1.05, 0.29, 1.50), (1.56, 0.12, 1.20), (2.12, -0.10, 0.88),
                   (2.51, -0.28, 0.60), (2.69, -0.43, 0.39), (2.69, -0.52, 0.76),
                   (2.54, -0.57, 1.22), (2.30, -0.59, 1.50), (2.09, -0.62, 1.29)],
        "radii": [1.31, 1.21, 1.03, 0.80, 0.58, 0.40, 0.25, 0.15, 0.09],
    },
    {
        "name": "Secondary_Rear_L", "role": "secondary", "chain": "Support_Side_L", "depth": 0.28,
        "points": [(-0.67, 0.58, 1.42), (-1.15, 0.62, 1.12), (-1.67, 0.51, 0.84),
                   (-2.03, 0.36, 0.65), (-2.20, 0.17, 0.79), (-2.18, 0.02, 1.10),
                   (-2.02, -0.05, 1.27), (-1.88, -0.08, 1.14)],
        "radii": [1.10, 1.00, 0.82, 0.62, 0.43, 0.28, 0.16, 0.09],
    },
    {
        "name": "Secondary_Rear_R", "role": "secondary", "chain": "Support_Side_R", "depth": 0.27,
        "points": [(0.64, 0.61, 1.43), (1.11, 0.69, 1.14), (1.63, 0.62, 0.89),
                   (2.00, 0.49, 0.73), (2.17, 0.31, 0.89), (2.14, 0.15, 1.18),
                   (1.98, 0.05, 1.33), (1.84, 0.01, 1.18)],
        "radii": [1.11, 1.00, 0.81, 0.61, 0.42, 0.27, 0.16, 0.09],
    },
)


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def verify_frozen_v004() -> None:
    checks = (
        (PROJECT_ROOT / "assets/lenox/lenox-v004.blend", V004_BLEND_SHA256),
        (PROJECT_ROOT / "public/models/lenox/lenox-v004.glb", V004_GLB_SHA256),
    )
    for path, expected in checks:
        actual = sha256(path)
        if actual != expected:
            raise RuntimeError(f"Frozen v004 anchor changed: {path} ({actual})")


def ensure_dirs_v005() -> None:
    for path in (BLEND_PATH, GLB_PATH, REPORT_PATH, LANDMARK_PATH,
                 BASE_COLOR_PATH, NORMAL_PATH, ROUGHNESS_PATH, IRIS_PATH):
        path.parent.mkdir(parents=True, exist_ok=True)


def make_image(name: str, path: Path, size: int, pixels: array, *, non_color: bool = False) -> bpy.types.Image:
    image = bpy.data.images.new(name, width=size, height=size, alpha=True)
    image.pixels.foreach_set(pixels)
    image.update()
    image.filepath_raw = str(path)
    image.file_format = "PNG"
    image.colorspace_settings.name = "Non-Color" if non_color else "sRGB"
    image.save()
    return image


def build_detail_maps_v005(size: int = 512) -> tuple[bpy.types.Image, bpy.types.Image]:
    base_color = array("f")
    normal = array("f")
    roughness = array("f")
    iris = array("f")
    for y in range(size):
        v = (y + 0.5) / size
        for x in range(size):
            u = (x + 0.5) / size
            field = (
                math.sin(u * 67.0 + math.sin(v * 19.0))
                + math.sin(v * 83.0 + u * 13.0)
                + math.sin((u + v) * 109.0)
            ) / 3.0
            pearl = max(0.0, math.sin((u * 29.0 + v * 17.0) * math.pi)) ** 18
            base_color.extend((
                min(1.0, 0.58 + field * 0.035 + pearl * 0.16),
                min(1.0, 0.82 + field * 0.028 + pearl * 0.12),
                min(1.0, 0.72 + field * 0.032 + pearl * 0.18),
                1.0,
            ))
            dx = math.cos(u * 67.0 + math.sin(v * 19.0)) * 0.024
            dy = math.cos(v * 83.0 + u * 13.0) * 0.024
            nx, ny, nz = -dx, -dy, 1.0
            length = math.sqrt(nx * nx + ny * ny + nz * nz)
            normal.extend((nx / length * 0.5 + 0.5, ny / length * 0.5 + 0.5, nz / length * 0.5 + 0.5, 1.0))
            r = max(0.17, min(0.39, 0.27 + field * 0.055 - pearl * 0.08))
            roughness.extend((r, r, r, 1.0))

            px = u * 2.0 - 1.0
            py = v * 2.0 - 1.0
            radius = math.sqrt(px * px + py * py)
            angle = math.atan2(py, px)
            fibers = 0.5 + 0.5 * math.sin(angle * 48.0 + radius * 74.0 + math.sin(angle * 7.0) * 3.0)
            pupil = 1.0 - min(1.0, max(0.0, (radius - 0.31) / 0.035))
            limbus = min(1.0, max(0.0, (radius - 0.78) / 0.12))
            gold = fibers * max(0.0, 1.0 - radius) * 0.34
            rr = 0.07 + gold * 0.80
            gg = 0.36 + fibers * 0.29 + gold * 0.42
            bb = 0.27 + (1.0 - fibers) * 0.17
            rr, gg, bb = (rr * (1.0 - limbus), gg * (1.0 - limbus), bb * (1.0 - limbus))
            rr, gg, bb = (rr * (1.0 - pupil) + 0.005 * pupil,
                          gg * (1.0 - pupil) + 0.012 * pupil,
                          bb * (1.0 - pupil) + 0.014 * pupil)
            iris.extend((rr, gg, bb, 1.0))

    TEXTURE_IMAGES["base_color"] = make_image("LENOX_v005_BaseColor", BASE_COLOR_PATH, size, base_color)
    TEXTURE_IMAGES["normal"] = make_image("LENOX_v005_Normal", NORMAL_PATH, size, normal, non_color=True)
    TEXTURE_IMAGES["roughness"] = make_image("LENOX_v005_Roughness", ROUGHNESS_PATH, size, roughness, non_color=True)
    TEXTURE_IMAGES["iris"] = make_image("LENOX_v005_Iris", IRIS_PATH, size, iris)
    return TEXTURE_IMAGES["normal"], TEXTURE_IMAGES["roughness"]


def connect_skin_maps_v005(skin: bpy.types.Material, normal: bpy.types.Image, roughness: bpy.types.Image) -> None:
    nodes = skin.node_tree.nodes
    links = skin.node_tree.links
    shader = nodes.get("Principled BSDF")
    color_tex = nodes.new("ShaderNodeTexImage")
    color_tex.name = "v005 Seafoam Speckle"
    color_tex.image = TEXTURE_IMAGES["base_color"]
    links.new(color_tex.outputs["Color"], shader.inputs["Base Color"])
    normal_tex = nodes.new("ShaderNodeTexImage")
    normal_tex.name = "v005 Pearl Normal"
    normal_tex.image = normal
    normal_map = nodes.new("ShaderNodeNormalMap")
    normal_map.inputs["Strength"].default_value = 0.26
    links.new(normal_tex.outputs["Color"], normal_map.inputs["Color"])
    links.new(normal_map.outputs["Normal"], shader.inputs["Normal"])
    roughness_tex = nodes.new("ShaderNodeTexImage")
    roughness_tex.name = "v005 Pearl Roughness"
    roughness_tex.image = roughness
    links.new(roughness_tex.outputs["Color"], shader.inputs["Roughness"])


base.build_detail_maps = build_detail_maps_v005
base.connect_skin_maps = connect_skin_maps_v005


def remove_object(obj: bpy.types.Object | None) -> None:
    if obj is None:
        return
    data = obj.data
    bpy.data.objects.remove(obj, do_unlink=True)
    if data and getattr(data, "users", 1) == 0:
        collection = getattr(bpy.data, f"{data.__class__.__name__.lower()}s", None)
        if collection and data.name in collection:
            collection.remove(data)


def remove_named(*, exact: tuple[str, ...] = (), prefixes: tuple[str, ...] = ()) -> None:
    for obj in tuple(bpy.data.objects):
        if obj.name in exact or any(obj.name.startswith(prefix) for prefix in prefixes):
            remove_object(obj)


def active_object(obj: bpy.types.Object) -> None:
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj


def apply_modifier(obj: bpy.types.Object, modifier: bpy.types.Modifier) -> None:
    active_object(obj)
    bpy.ops.object.modifier_apply(modifier=modifier.name)


def join_objects(objects: list[bpy.types.Object], name: str) -> bpy.types.Object:
    objects = [obj for obj in objects if obj and obj.name in bpy.data.objects]
    if not objects:
        raise RuntimeError(f"No objects to join for {name}")
    bpy.ops.object.select_all(action="DESELECT")
    for obj in objects:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = objects[0]
    bpy.ops.object.join()
    result = bpy.context.object
    result.name = name
    return result


BODY_PROFILE = (
    (0.18, 0.22, 0.19, 0.18),
    (0.36, 0.72, 0.58, 0.17),
    (0.66, 1.20, 0.91, 0.16),
    (1.02, 1.52, 1.10, 0.15),
    (1.42, 1.68, 1.20, 0.14),
    (1.82, 1.66, 1.23, 0.12),
    (2.18, 1.48, 1.18, 0.10),
    (2.43, 1.37, 1.16, 0.08),
    (2.64, 1.66, 1.35, 0.07),
    (2.88, 1.94, 1.48, 0.06),
    (3.22, 2.10, 1.55, 0.05),
    (3.62, 2.14, 1.57, 0.04),
    (4.02, 2.08, 1.51, 0.04),
    (4.38, 1.92, 1.39, 0.05),
    (4.68, 1.62, 1.18, 0.08),
    (4.91, 1.16, 0.84, 0.11),
    (5.07, 0.58, 0.46, 0.13),
    (5.13, 0.16, 0.15, 0.14),
)


def add_profile_body(name: str, segments: int, material: bpy.types.Material,
                     target: bpy.types.Collection) -> bpy.types.Object:
    vertices: list[tuple[float, float, float]] = []
    uvs: list[tuple[float, float]] = []
    for ring_index, (z, rx, ry, center_y) in enumerate(BODY_PROFILE):
        v = ring_index / (len(BODY_PROFILE) - 1)
        for segment in range(segments + 1):
            u = segment / segments
            angle = u * math.tau
            cheek = 1.0 + 0.035 * max(0.0, math.cos(angle)) * math.sin(v * math.pi)
            vertices.append((math.cos(angle) * rx * cheek, center_y + math.sin(angle) * ry, z))
            uvs.append((u, v))
    faces: list[tuple[int, ...]] = []
    stride = segments + 1
    for ring in range(len(BODY_PROFILE) - 1):
        for segment in range(segments):
            a = ring * stride + segment
            b = a + 1
            c = a + stride + 1
            d = a + stride
            faces.append((a, b, c, d))
    faces.append(tuple(reversed([segment for segment in range(segments)])))
    top_start = (len(BODY_PROFILE) - 1) * stride
    faces.append(tuple(top_start + segment for segment in range(segments)))
    mesh = bpy.data.meshes.new(f"{name}_Mesh")
    mesh.from_pydata(vertices, [], faces)
    mesh.update()
    uv_layer = mesh.uv_layers.new(name="UVMap")
    for loop in mesh.loops:
        uv_layer.data[loop.index].uv = uvs[loop.vertex_index]
    obj = bpy.data.objects.new(name, mesh)
    mesh.materials.append(material)
    target.objects.link(obj)
    for polygon in mesh.polygons:
        polygon.use_smooth = True
    return obj


def create_body_and_sculpt(rig: bpy.types.Object, skin: bpy.types.Material,
                           export: bpy.types.Collection, sculpt: bpy.types.Collection) -> bpy.types.Object:
    body = add_profile_body("LENOX_HeadBody", 40, skin, export)
    subdivision = body.modifiers.new("Deterministic retopo smoothing", "SUBSURF")
    subdivision.levels = 1
    subdivision.render_levels = 1
    apply_modifier(body, subdivision)

    nose = base.add_uv_sphere("LENOX_Nose", (0.0, -1.50, 2.96), (0.070, 0.036, 0.050),
                              skin, export, segments=16, rings=10)
    body = join_objects([body, nose], "LENOX_HeadBody")
    base.parent_to_bone(body, rig, "Root")
    body["form_note"] = "continuous baby-cephalopod head/body cage; no neck seam"

    sculpt_body = add_profile_body("SCULPT_HeadBody_High", 96, skin, sculpt)
    subdivision = sculpt_body.modifiers.new("High source subdivision", "SUBSURF")
    subdivision.levels = 2
    subdivision.render_levels = 2
    apply_modifier(sculpt_body, subdivision)
    texture = bpy.data.textures.new("SCULPT_v005_Pearl_Microdetail", type="CLOUDS")
    texture.noise_scale = 0.055
    displacement = sculpt_body.modifiers.new("Sculpt microdetail", "DISPLACE")
    displacement.texture = texture
    displacement.strength = 0.014
    displacement.texture_coords = "GLOBAL"
    apply_modifier(sculpt_body, displacement)
    sculpt_body.hide_render = True
    sculpt.hide_viewport = True
    sculpt.hide_render = True
    return body


def add_fin_v005(label: str, side: float, material: bpy.types.Material,
                 target: bpy.types.Collection) -> bpy.types.Object:
    rows = 7
    columns = 6
    outer = (
        (2.10, 4.48), (2.47, 4.36), (2.72, 4.14), (2.82, 3.84),
        (2.70, 3.53), (2.45, 3.29), (2.10, 3.16),
    )
    vertices = []
    faces = []
    for row in range(rows):
        v = row / (rows - 1)
        root_z = 4.27 + (3.30 - 4.27) * v
        outer_x, outer_z = outer[row]
        for column in range(columns):
            u = column / (columns - 1)
            ease = u * u * (3.0 - 2.0 * u)
            x = (1.48 + (outer_x - 1.48) * ease) * side
            z = root_z + (outer_z - root_z) * ease
            y = -0.20 - 0.56 * ease - math.sin(u * math.pi) * 0.20 - math.sin(v * math.pi) * 0.05
            vertices.append((x, y, z))
    for row in range(rows - 1):
        for column in range(columns - 1):
            a = row * columns + column
            faces.append((a, a + 1, a + columns + 1, a + columns))
    mesh = bpy.data.meshes.new(f"LENOX_Fin_{label}_Mesh")
    mesh.from_pydata(vertices, [], faces)
    mesh.update()
    fin = bpy.data.objects.new(f"LENOX_Fin_{label}", mesh)
    mesh.materials.append(material)
    target.objects.link(fin)
    solidify = fin.modifiers.new("Soft membrane thickness", "SOLIDIFY")
    solidify.thickness = 0.055
    bevel = fin.modifiers.new("Rounded fan perimeter", "BEVEL")
    bevel.width = 0.045
    bevel.segments = 2
    subdivision = fin.modifiers.new("Organic membrane", "SUBSURF")
    subdivision.levels = 2
    subdivision.render_levels = 2
    apply_modifier(fin, solidify)
    apply_modifier(fin, bevel)
    apply_modifier(fin, subdivision)

    ribs = []
    for row in (1, 2, 3, 4, 5):
        v = row / (rows - 1)
        root_z = 4.27 + (3.30 - 4.27) * v
        outer_x, outer_z = outer[row]
        ribs.append(base.add_poly_curve(
            f"LENOX_FinRib_{label}_{row}",
            [
                (1.52 * side, -0.25, root_z),
                (((1.52 + outer_x) * 0.5) * side, -0.65, (root_z + outer_z) * 0.5),
                ((outer_x - 0.08) * side, -0.82, outer_z),
            ],
            0.020,
            material,
            target,
        ))
    fin = join_objects([fin, *ribs], f"LENOX_Fin_{label}")
    for polygon in fin.data.polygons:
        polygon.use_smooth = True
    basis = fin.shape_key_add(name="Basis")
    concerned = fin.shape_key_add(name="Concerned")
    confirm = fin.shape_key_add(name="Confirm")
    thinking = fin.shape_key_add(name="Thinking")
    for index, vertex in enumerate(basis.data):
        influence = max(0.0, min(1.0, (abs(vertex.co.x) - 1.48) / 1.34))
        concerned.data[index].co.z -= 0.25 * influence
        concerned.data[index].co.y += 0.12 * influence
        confirm.data[index].co.z += 0.18 * influence
        confirm.data[index].co.y -= 0.08 * influence
        thinking.data[index].co.y -= 0.04 * influence
    fin["form_note"] = "curved ribbed fan; broad root; camera-forward sweep"
    return fin


def add_patch(name: str, paths: tuple[tuple[tuple[float, float, float], ...], ...], width: float,
              material: bpy.types.Material, target: bpy.types.Collection, channel: str) -> bpy.types.Object:
    vertices = []
    faces = []
    for path in paths:
        start = len(vertices)
        for x, y, z in path:
            vertices.extend(((x, y + 0.006, z - width * 0.5), (x, y - 0.006, z + width * 0.5)))
        for index in range(len(path) - 1):
            a = start + index * 2
            faces.append((a, a + 2, a + 3, a + 1))
    mesh = bpy.data.meshes.new(f"{name}_Mesh")
    mesh.from_pydata(vertices, [], faces)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    mesh.materials.append(material)
    target.objects.link(obj)
    solidify = obj.modifiers.new("Skin-near relief", "SOLIDIFY")
    solidify.thickness = 0.018
    bevel = obj.modifiers.new("Soft patch edge", "BEVEL")
    bevel.width = 0.014
    bevel.segments = 2
    subdivision = obj.modifiers.new("Integrated patch", "SUBSURF")
    subdivision.levels = 1
    subdivision.render_levels = 1
    apply_modifier(obj, solidify)
    apply_modifier(obj, bevel)
    apply_modifier(obj, subdivision)
    basis = obj.shape_key_add(name="Basis")
    concerned = obj.shape_key_add(name="Concerned")
    confirm = obj.shape_key_add(name="Confirm")
    thinking = obj.shape_key_add(name="Thinking")
    for index, vertex in enumerate(basis.data):
        inner = 1.0 - min(1.0, abs(vertex.co.x) / 1.20)
        if channel == "brow":
            concerned.data[index].co.z += inner * 0.13
            confirm.data[index].co.z += (1.0 - inner) * 0.045
            thinking.data[index].co.z += (0.5 - inner) * 0.035
        elif channel == "lid":
            concerned.data[index].co.z -= 0.065
            concerned.data[index].co.y -= 0.018
            confirm.data[index].co.z += 0.025
            thinking.data[index].co.z -= 0.032
        elif channel == "mouth":
            concerned.data[index].co.z += abs(vertex.co.x) * 0.045
            confirm.data[index].co.z -= abs(vertex.co.x) * 0.045
            thinking.data[index].co.z += vertex.co.x * 0.020
    return obj


def configure_iris_material(material: bpy.types.Material) -> None:
    nodes = material.node_tree.nodes
    links = material.node_tree.links
    shader = nodes.get("Principled BSDF")
    for node in tuple(nodes):
        if node.type == "TEX_IMAGE":
            nodes.remove(node)
    texture = nodes.new("ShaderNodeTexImage")
    texture.name = "v005 Green Gold Iris"
    texture.image = TEXTURE_IMAGES["iris"]
    links.new(texture.outputs["Color"], shader.inputs["Base Color"])
    shader.inputs["Roughness"].default_value = 0.12
    shader.inputs["Metallic"].default_value = 0.05
    if "Clearcoat" in shader.inputs:
        shader.inputs["Clearcoat"].default_value = 0.72
        shader.inputs["Clearcoat Roughness"].default_value = 0.08


def create_eye_discs(rig: bpy.types.Object, iris_material: bpy.types.Material,
                     target: bpy.types.Collection) -> bpy.types.Object:
    vertices = []
    faces = []
    uvs = []
    eye_vertex_indices: dict[str, list[int]] = {"L": [], "R": []}
    segments = 32
    for label, side in (("L", -1.0), ("R", 1.0)):
        center = len(vertices)
        vertices.append((0.63 * side, -1.682, 3.66))
        uvs.append((0.5, 0.5))
        eye_vertex_indices[label].append(center)
        for segment in range(segments + 1):
            angle = segment / segments * math.tau
            index = len(vertices)
            vertices.append((0.63 * side + math.cos(angle) * 0.50,
                             -1.682,
                             3.66 + math.sin(angle) * 0.58))
            uvs.append((0.5 + math.cos(angle) * 0.5, 0.5 + math.sin(angle) * 0.5))
            eye_vertex_indices[label].append(index)
        for segment in range(segments):
            faces.append((center, center + segment + 1, center + segment + 2))
    mesh = bpy.data.meshes.new("LENOX_Eye_Iris_Gaze_Mesh")
    mesh.from_pydata(vertices, [], faces)
    mesh.update()
    uv_layer = mesh.uv_layers.new(name="UVMap")
    for loop in mesh.loops:
        uv_layer.data[loop.index].uv = uvs[loop.vertex_index]
    obj = bpy.data.objects.new("LENOX_Eye_Iris_Gaze", mesh)
    mesh.materials.append(iris_material)
    target.objects.link(obj)
    modifier = obj.modifiers.new("LENOX Eye Armature", "ARMATURE")
    modifier.object = rig
    for label in ("L", "R"):
        group = obj.vertex_groups.new(name=f"Eye.{label}")
        group.add(eye_vertex_indices[label], 1.0, "REPLACE")
    obj.parent = rig
    return obj


def reposition_rig(rig: bpy.types.Object) -> None:
    active_object(rig)
    bpy.ops.object.mode_set(mode="EDIT")
    rig.data.edit_bones["Eye.L"].head = (-0.63, -1.40, 3.66)
    rig.data.edit_bones["Eye.L"].tail = (-0.63, -1.73, 3.66)
    rig.data.edit_bones["Eye.R"].head = (0.63, -1.40, 3.66)
    rig.data.edit_bones["Eye.R"].tail = (0.63, -1.73, 3.66)
    rig.data.edit_bones["Fin.L"].head = (-1.55, -0.22, 3.78)
    rig.data.edit_bones["Fin.L"].tail = (-2.34, -0.70, 3.80)
    rig.data.edit_bones["Fin.R"].head = (1.55, -0.22, 3.78)
    rig.data.edit_bones["Fin.R"].tail = (2.34, -0.70, 3.80)
    for spec in ARM_SPECS_V005[:6]:
        segment_count = 4 if spec["role"] == "lead" else 3
        chain_points = [
            spec["points"][round(index * (len(spec["points"]) - 1) / segment_count)]
            for index in range(segment_count + 1)
        ]
        for index in range(segment_count):
            bone = rig.data.edit_bones[f"Arm_{spec['chain']}_{index + 1:02d}"]
            bone.head = chain_points[index]
            bone.tail = chain_points[index + 1]
    bpy.ops.object.mode_set(mode="OBJECT")


def smooth_arm_weights(obj: bpy.types.Object, rig: bpy.types.Object, spec: dict) -> None:
    modifier = obj.modifiers.new("LENOX Armature", "ARMATURE")
    modifier.object = rig
    segment_count = 4 if spec["role"] == "lead" else 3
    groups = [obj.vertex_groups.new(name=f"Arm_{spec['chain']}_{index + 1:02d}")
              for index in range(segment_count)]
    points = [Vector(point) for point in spec["points"]]
    lengths = [(points[index + 1] - points[index]).length for index in range(len(points) - 1)]
    total = sum(lengths)
    cumulative = [0.0]
    for length in lengths:
        cumulative.append(cumulative[-1] + length)
    centers = [(index + 0.5) / segment_count for index in range(segment_count)]
    for vertex in obj.data.vertices:
        position = obj.matrix_world @ vertex.co
        best_distance = float("inf")
        best_t = 0.0
        for index in range(len(points) - 1):
            segment = points[index + 1] - points[index]
            denom = max(segment.length_squared, 1e-8)
            local_t = max(0.0, min(1.0, (position - points[index]).dot(segment) / denom))
            projected = points[index] + segment * local_t
            distance = (position - projected).length_squared
            if distance < best_distance:
                best_distance = distance
                best_t = (cumulative[index] + lengths[index] * local_t) / max(total, 1e-8)
        nearest = sorted(range(segment_count), key=lambda index: abs(centers[index] - best_t))[:2]
        if len(nearest) == 1:
            groups[nearest[0]].add([vertex.index], 1.0, "REPLACE")
        else:
            a, b = nearest
            distance_a = abs(centers[a] - best_t)
            distance_b = abs(centers[b] - best_t)
            weight_a = distance_b / max(distance_a + distance_b, 1e-8)
            groups[a].add([vertex.index], weight_a, "REPLACE")
            groups[b].add([vertex.index], 1.0 - weight_a, "REPLACE")
    obj.parent = rig
    obj["visible_role"] = spec["role"]
    obj["control_chain"] = spec["chain"]


def create_arms_and_suckers(rig: bpy.types.Object, skin: bpy.types.Material,
                            sucker_material: bpy.types.Material,
                            target: bpy.types.Collection) -> tuple[list[bpy.types.Object], bpy.types.Object]:
    arms = []
    for spec in ARM_SPECS_V005:
        arm = base.add_curve_mesh(
            f"LENOX_Arm_{spec['name']}", spec["points"], spec["radii"], spec["depth"],
            skin, target, bevel_resolution=3 if spec["role"] == "lead" else 2, resolution=5,
        )
        smooth_arm_weights(arm, rig, spec)
        arms.append(arm)

    suckers = []
    for spec in ARM_SPECS_V005:
        segment_count = 4 if spec["role"] == "lead" else 3
        for point_index in range(2, 7):
            point = spec["points"][point_index]
            taper = 1.0 - (point_index - 2) * 0.13
            bpy.ops.mesh.primitive_torus_add(
                major_segments=8, minor_segments=4, mode="MAJOR_MINOR",
                major_radius=0.074 * taper, minor_radius=0.018 * taper,
                location=(point[0], point[1] - spec["depth"] * 0.76, point[2]),
                rotation=(math.pi / 2.0, 0.0, 0.0),
            )
            sucker = bpy.context.object
            sucker.data.materials.append(sucker_material)
            move = target
            base.move_to_collection(sucker, move)
            t = point_index / (len(spec["points"]) - 1)
            bone_index = min(segment_count - 1, int(t * segment_count))
            group = sucker.vertex_groups.new(name=f"Arm_{spec['chain']}_{bone_index + 1:02d}")
            group.add([vertex.index for vertex in sucker.data.vertices], 1.0, "REPLACE")
            suckers.append(sucker)
    combined = join_objects(suckers, "LENOX_Suckers")
    modifier = combined.modifiers.new("LENOX Armature", "ARMATURE")
    modifier.object = rig
    combined.parent = rig
    for polygon in combined.data.polygons:
        polygon.use_smooth = True
    return arms, combined


def rebuild_crown(rig: bpy.types.Object, material: bpy.types.Material,
                  target: bpy.types.Collection) -> bpy.types.Object:
    positions = (
        (0.00, -0.48, 5.13, 0.085, 0.115),
        (-0.22, -0.62, 5.04, 0.075, 0.100), (0.22, -0.62, 5.04, 0.075, 0.100),
        (-0.48, -0.82, 4.91, 0.070, 0.093), (0.48, -0.82, 4.91, 0.070, 0.093),
        (-0.76, -1.01, 4.72, 0.064, 0.084), (0.76, -1.01, 4.72, 0.064, 0.084),
        (-1.02, -1.14, 4.49, 0.055, 0.073), (1.02, -1.14, 4.49, 0.055, 0.073),
        (-0.12, -1.18, 4.78, 0.060, 0.080), (0.12, -1.18, 4.78, 0.060, 0.080),
        (-0.34, -1.26, 4.58, 0.052, 0.068), (0.34, -1.26, 4.58, 0.052, 0.068),
        (-0.08, -1.34, 4.48, 0.045, 0.060), (0.08, -1.34, 4.48, 0.045, 0.060),
    )
    pearls = [base.add_uv_sphere(
        f"LENOX_CrownPearl_{index:02d}", (x, y, z), (sx, 0.040, sz), material, target,
        segments=12, rings=8,
    ) for index, (x, y, z, sx, sz) in enumerate(positions, start=1)]
    crown = join_objects(pearls, "LENOX_CrownPearls")
    base.parent_to_bone(crown, rig, "Head")
    return crown


def configure_materials(character: dict) -> dict[str, bpy.types.Material]:
    skin, skin_light, opal, sclera, iris, pupil, coral = character["materials"]
    skin.diffuse_color = (0.58, 0.82, 0.72, 1.0)
    skin_light.diffuse_color = (0.76, 0.91, 0.80, 1.0)
    opal.diffuse_color = (0.91, 0.96, 0.78, 1.0)
    sclera.diffuse_color = (0.91, 0.92, 0.80, 1.0)
    coral.diffuse_color = (0.57, 0.25, 0.20, 1.0)
    for material, roughness, metallic in (
        (skin, 0.27, 0.025), (skin_light, 0.24, 0.02), (opal, 0.14, 0.08),
        (sclera, 0.20, 0.0), (coral, 0.38, 0.0),
    ):
        shader = material.node_tree.nodes.get("Principled BSDF")
        shader.inputs["Roughness"].default_value = roughness
        shader.inputs["Metallic"].default_value = metallic
    configure_iris_material(iris)
    return {"skin": skin, "skin_light": skin_light, "opal": opal,
            "sclera": sclera, "iris": iris, "pupil": pupil, "coral": coral}


def create_character_v005() -> dict:
    character = v004.create_character_v004()
    rig = character["rig"]
    export = bpy.data.collections[base.EXPORT_COLLECTION]
    sculpt = bpy.data.collections[base.SCULPT_COLLECTION]
    materials = configure_materials(character)

    remove_named(
        exact=("LENOX_Head", "LENOX_Mantle", "LENOX_Suckers", "SCULPT_Head_High", "SCULPT_Mantle_High"),
        prefixes=("LENOX_Eye_", "LENOX_Brow_", "LENOX_UpperLid_", "LENOX_Mouth_Closed",
                  "LENOX_Nose", "LENOX_Nostril_", "LENOX_CrownPearl_", "LENOX_Arm_", "LENOX_Fin_"),
    )
    reposition_rig(rig)

    body = create_body_and_sculpt(rig, materials["skin"], export, sculpt)
    fins = {}
    for label, side in (("L", -1.0), ("R", 1.0)):
        fin = add_fin_v005(label, side, materials["skin"], export)
        base.parent_to_bone(fin, rig, f"Fin.{label}")
        fins[label] = fin

    sclera_parts = [base.add_uv_sphere(
        f"LENOX_Eye_Sclera_{label}", (0.63 * side, -1.46, 3.66), (0.69, 0.25, 0.80),
        materials["sclera"], export, segments=28, rings=18,
    ) for label, side in (("L", -1.0), ("R", 1.0))]
    sclera = join_objects(sclera_parts, "LENOX_Eye_Sclera")
    base.parent_to_bone(sclera, rig, "Head")
    irises = create_eye_discs(rig, materials["iris"], export)

    glint_parts = [base.add_uv_sphere(
        f"LENOX_Eye_Glint_{label}", (0.49 * side, -1.705, 3.89), (0.105, 0.026, 0.135),
        materials["opal"], export, segments=14, rings=8,
    ) for label, side in (("L", -1.0), ("R", 1.0))]
    glints = join_objects(glint_parts, "LENOX_Eye_Glints_Stable")
    base.parent_to_bone(glints, rig, "Head")
    glints["glint_contract"] = "head/cornea stable; never emotion-switched"

    brows = add_patch(
        "LENOX_Brow_Ridges",
        (
            ((-1.18, -1.39, 4.30), (-0.78, -1.45, 4.32), (-0.30, -1.43, 4.30)),
            ((0.30, -1.43, 4.30), (0.78, -1.45, 4.32), (1.18, -1.39, 4.30)),
        ), 0.055, materials["skin"], export, "brow",
    )
    base.parent_to_bone(brows, rig, "Head")
    lids = add_patch(
        "LENOX_UpperLids",
        (
            ((-1.28, -1.54, 3.91), (-0.67, -1.65, 4.18), (-0.12, -1.54, 3.98)),
            ((0.12, -1.54, 3.98), (0.67, -1.65, 4.18), (1.28, -1.54, 3.91)),
        ), 0.075, materials["skin"], export, "lid",
    )
    base.parent_to_bone(lids, rig, "Head")
    mouth = add_patch(
        "LENOX_Mouth_Closed",
        (((-0.25, -1.505, 2.73), (-0.12, -1.535, 2.69), (0.0, -1.542, 2.68),
          (0.12, -1.535, 2.69), (0.25, -1.505, 2.73)),),
        0.030, materials["coral"], export, "mouth",
    )
    mouth["mouth_constraint"] = "closed_lip_only"
    base.parent_to_bone(mouth, rig, "Head")

    nostrils = [base.add_uv_sphere(
        f"LENOX_Nostril_{label}", (0.026 * side, -1.535, 2.96), (0.010, 0.008, 0.008),
        materials["coral"], export, segments=10, rings=6,
    ) for label, side in (("L", -1.0), ("R", 1.0))]
    nostrils_obj = join_objects(nostrils, "LENOX_Nostrils")
    base.parent_to_bone(nostrils_obj, rig, "Head")

    crown = rebuild_crown(rig, materials["opal"], export)
    arms, suckers = create_arms_and_suckers(rig, materials["skin"], materials["skin"], export)

    anchor = bpy.data.objects.get("LENOX_FACE_ANCHOR")
    if anchor:
        world = anchor.matrix_world.copy()
        world.translation = Vector((0.0, -1.50, 3.58))
        anchor.matrix_world = world

    character["root"]["version"] = "v005"
    character["root"]["form_law"] = "canonical_png; visual review remains human"
    character.update({
        "head": body,
        "mantle": body,
        "fins": fins,
        "eyes": {"sclera": sclera, "iris": irises, "glints": glints},
        "mouth": mouth,
        "arms": arms,
        "suckers": suckers,
        "crown": crown,
        "render_groups": {
            "body": [body],
            "face": [*fins.values(), sclera, irises, glints, brows, lids, mouth, nostrils_obj, crown],
            "arms": [*arms, suckers],
        },
    })
    return character


def set_shape_direct(name: str, value: float) -> None:
    export = bpy.data.collections[base.EXPORT_COLLECTION]
    for obj in tuple(bpy.data.objects):
        if export not in obj.users_collection:
            continue
        keys = getattr(getattr(obj, "data", None), "shape_keys", None)
        if keys and name in keys.key_blocks:
            keys.key_blocks[name].value = value


def neutral_shapes() -> None:
    for name in ("Concerned", "Confirm", "Thinking"):
        set_shape_direct(name, 0.0)


def create_animation_v005(character: dict) -> None:
    scene = bpy.context.scene
    scene.frame_start = 1
    scene.frame_end = 144
    scene.render.fps = 24
    rig = character["rig"]
    for frame, mode in ((1, "rest"), (36, "observe"), (72, "concerned"), (108, "confirm"), (144, "rest")):
        scene.frame_set(frame)
        for pose_bone in rig.pose.bones:
            if not pose_bone.name.startswith("Arm_"):
                continue
            seed = sum(ord(char) for char in pose_bone.name) * 0.013
            lead = "Lead" in pose_bone.name
            amplitude = 0.075 if lead else 0.022
            if mode == "confirm" and lead:
                amplitude += 0.11
            if mode == "concerned":
                amplitude *= 0.55
            pose_bone.rotation_mode = "XYZ"
            pose_bone.rotation_euler.x = math.sin(frame * 0.041 + seed) * amplitude * 0.28
            pose_bone.rotation_euler.y = math.cos(frame * 0.033 + seed) * amplitude * 0.18
            pose_bone.rotation_euler.z = math.sin(frame * 0.027 + seed) * amplitude
            pose_bone.keyframe_insert("rotation_euler")
        for eye_name in ("Eye.L", "Eye.R"):
            eye = rig.pose.bones[eye_name]
            eye.rotation_mode = "XYZ"
            eye.rotation_euler.x = 0.030 if mode == "observe" else (-0.014 if mode == "concerned" else 0.0)
            eye.rotation_euler.z = 0.022 if mode == "observe" else 0.0
            eye.keyframe_insert("rotation_euler")
    if rig.animation_data and rig.animation_data.action:
        rig.animation_data.action.name = "LENOX_v005_MotionExpression_Test"


def set_mesh_visibility(character: dict, groups: tuple[str, ...]) -> None:
    visible = {obj for group in groups for obj in character["render_groups"][group]}
    export = bpy.data.collections[base.EXPORT_COLLECTION]
    bpy.context.view_layer.update()
    for obj in tuple(bpy.data.objects):
        if obj.type == "MESH" and export in obj.users_collection:
            obj.hide_render = obj not in visible


def render_self_checks_v005(character: dict, studio: dict) -> None:
    neutral_shapes()
    set_mesh_visibility(character, ("body",))
    for size in (64, 96):
        base.render(ARTIFACT_DIR / f"selfcheck-body-{size}px.png", size, frame=1)
    set_mesh_visibility(character, ("body", "face"))
    for size in (64, 96):
        base.render(ARTIFACT_DIR / f"selfcheck-face-fins-{size}px.png", size, frame=1)
    set_mesh_visibility(character, ("body", "face", "arms"))
    for size in (64, 96):
        base.render(ARTIFACT_DIR / f"silhouette-v005-{size}px.png", size, frame=1)

    base.render(ARTIFACT_DIR / "inspection-front-neutral.png", 1024, frame=1)
    camera = studio["camera"]
    original_location = camera.location.copy()
    original_rotation = camera.rotation_euler.copy()
    camera.location = (7.2, -12.5, 3.55)
    base.aim_at(camera, (0.0, 0.0, 2.55))
    base.render(ARTIFACT_DIR / "inspection-three-quarter.png", 1024, frame=36)
    camera.location = original_location
    camera.rotation_euler = original_rotation

    expression_states = (
        ("neutral", {}),
        ("observe", {"Thinking": 0.35}),
        ("concerned", {"Concerned": 1.0}),
        ("confirm", {"Confirm": 1.0}),
    )
    for label, values in expression_states:
        neutral_shapes()
        for name, value in values.items():
            set_shape_direct(name, value)
        base.render(ARTIFACT_DIR / f"expression-{label}.png", 512, frame=1)
    neutral_shapes()
    export = bpy.data.collections[base.EXPORT_COLLECTION]
    for obj in tuple(bpy.data.objects):
        if obj.type == "MESH" and export in obj.users_collection:
            obj.hide_render = False


def write_landmarks() -> None:
    landmarks = {
        "authority": "docs/character/lenox-canonical-reference.png",
        "coordinate_space": "normalized canonical character envelope; diagnostic only",
        "visual_approval": False,
        "points": {
            "crown_top": [0.50, 0.00],
            "head_chin": [0.50, 0.57],
            "left_fin_tip": [0.00, 0.34],
            "right_fin_tip": [1.00, 0.34],
            "left_eye_center": [0.34, 0.40],
            "right_eye_center": [0.66, 0.40],
            "left_outer_arm": [0.03, 0.77],
            "right_outer_arm": [0.97, 0.77],
            "body_bottom": [0.50, 1.00],
        },
        "checks": ["head_body_ratio", "fin_span", "eye_spacing", "arm_mass", "eight_arm_readability"],
    }
    LANDMARK_PATH.write_text(json.dumps(landmarks, indent=2) + "\n", encoding="utf-8")


def report_v005(character: dict) -> dict:
    result = base.report(character)
    gltf = base.glb_json(GLB_PATH)
    primitive_count = sum(len(mesh.get("primitives", [])) for mesh in gltf.get("meshes", []))
    result.update({
        "version": "v005",
        "frozen_v004": {
            "blend_sha256": V004_BLEND_SHA256,
            "glb_sha256": V004_GLB_SHA256,
        },
        "toolchain": {
            "blender_binary": bpy.app.binary_path,
            "blender_version": bpy.app.version_string,
            "blender_python": sys.version.split()[0],
            "generator_sha256": sha256(Path(__file__)),
            "canonical_reference_sha256": sha256(base.REFERENCE_PATH),
            "canonical_command": "blender --background --factory-startup --gpu-backend opengl --python tools/blender/generate_lenox_v005.py",
        },
        "output_sha256": {
            "blend": sha256(BLEND_PATH),
            "glb": sha256(GLB_PATH),
        },
        "gltf_primitive_count": primitive_count,
        "texture_dimensions": {
            path.name: [512, 512]
            for path in (BASE_COLOR_PATH, NORMAL_PATH, ROUGHNESS_PATH, IRIS_PATH)
        },
        "silhouette_self_checks": [
            "selfcheck-body-64px.png", "selfcheck-body-96px.png",
            "selfcheck-face-fins-64px.png", "selfcheck-face-fins-96px.png",
            "silhouette-v005-64px.png", "silhouette-v005-96px.png",
        ],
        "inspection_renders": [
            "inspection-front-neutral.png", "inspection-three-quarter.png",
            "expression-neutral.png", "expression-observe.png",
            "expression-concerned.png", "expression-confirm.png",
        ],
        "landmark_manifest": str(LANDMARK_PATH.relative_to(PROJECT_ROOT)),
        "model_form_state": "v005_visual_candidate_human_review_required",
        "visual_self_approval": False,
        "internal_targets": {
            "triangles": 52_000,
            "primitives": 20,
            "materials": 8,
            "textures": 4,
        },
    })
    result.pop("technical_form_checks", None)
    REPORT_PATH.write_text(json.dumps(result, indent=2) + "\n", encoding="utf-8")
    return result


def main() -> None:
    base.progress("v005_start")
    verify_frozen_v004()
    ensure_dirs_v005()
    base.clear_scene()
    base.progress("scene_cleared")
    character = create_character_v005()
    base.progress("v005_character_complete")
    studio = base.create_studio()
    base.configure_render()
    # Neutral reef-near inspection: enough contrast to show form without a dark-world bias.
    studio["ground"].data.materials[0].diffuse_color = (0.72, 0.76, 0.73, 1.0)
    bpy.context.scene.world.node_tree.nodes["Background"].inputs["Color"].default_value = (0.72, 0.75, 0.73, 1.0)
    bpy.context.scene.world.node_tree.nodes["Background"].inputs["Strength"].default_value = 0.32
    create_animation_v005(character)
    base.progress("animation_complete")
    render_self_checks_v005(character, studio)
    write_landmarks()
    base.progress("renders_complete")
    neutral_shapes()
    bpy.context.scene.frame_set(1)
    bpy.ops.wm.save_as_mainfile(filepath=str(BLEND_PATH))
    base.progress("blend_saved")
    base.export_glb(character)
    base.progress("glb_exported")
    result = report_v005(character)
    bpy.ops.wm.save_as_mainfile(filepath=str(BLEND_PATH))
    print("LENOX_V005_RESULT=" + json.dumps(result, sort_keys=True))
    if not result["budget"]["glb_pass"] or not result["budget"]["triangles_pass"]:
        raise RuntimeError("LENOX v005 exceeded the hard web budget")


if __name__ == "__main__":
    main()
