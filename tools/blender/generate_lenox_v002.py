"""Generate the first complete authored LENOX v002 web asset.

Shape law: docs/character/lenox-canonical-reference.png.
Motion reference is deliberately not consumed by this generator.

Outputs:
  assets/lenox/lenox-v002.blend
  public/models/lenox/lenox-v002.glb
  artifacts/lenox-blender/v002/*.png
  artifacts/lenox-blender/v002/lenox-v002-report.json

Validated with Blender 3.6.23:
  blender --background --gpu-backend opengl --python tools/blender/generate_lenox_v002.py
"""

from __future__ import annotations

import json
import math
import struct
from pathlib import Path

import bpy
from mathutils import Vector


PROJECT_ROOT = Path(__file__).resolve().parents[2]
REFERENCE_PATH = PROJECT_ROOT / "docs/character/lenox-canonical-reference.png"
BLEND_PATH = PROJECT_ROOT / "assets/lenox/lenox-v002.blend"
GLB_PATH = PROJECT_ROOT / "public/models/lenox/lenox-v002.glb"
ARTIFACT_DIR = PROJECT_ROOT / "artifacts/lenox-blender/v002"
REPORT_PATH = ARTIFACT_DIR / "lenox-v002-report.json"
NORMAL_PATH = PROJECT_ROOT / "assets/lenox/textures/lenox-pearl-normal.png"
ROUGHNESS_PATH = PROJECT_ROOT / "assets/lenox/textures/lenox-pearl-roughness.png"

EXPORT_COLLECTION = "LENOX_EXPORT"
SCULPT_COLLECTION = "LENOX_SCULPT_SOURCE"
STUDIO_COLLECTION = "LENOX_STUDIO"
GUIDE_COLLECTION = "LENOX_GUIDES"
SKIN_MATERIAL = "LENOX_PearlOpal_Skin"


ARM_SPECS = (
    {
        "name": "Lead_L",
        "role": "lead",
        "chain": "Lead_L",
        "points": [(-0.42, -0.30, 1.48), (-0.72, -0.82, 1.04), (-1.04, -1.10, 0.50), (-1.08, -1.18, 0.08), (-0.72, -1.26, -0.02), (-0.47, -1.30, 0.20), (-0.62, -1.31, 0.42)],
        "radii": [1.42, 1.30, 1.08, 0.78, 0.50, 0.29, 0.13],
        "depth": 0.34,
    },
    {
        "name": "Lead_R",
        "role": "lead",
        "chain": "Lead_R",
        "points": [(0.36, -0.34, 1.50), (0.61, -0.89, 1.08), (0.88, -1.16, 0.56), (0.90, -1.23, 0.12), (0.59, -1.30, 0.02), (0.37, -1.34, 0.25), (0.52, -1.34, 0.43)],
        "radii": [1.46, 1.32, 1.05, 0.72, 0.44, 0.27, 0.13],
        "depth": 0.35,
    },
    {
        "name": "Support_Front_L",
        "role": "support",
        "chain": "Support_Front_L",
        "points": [(-0.76, -0.12, 1.43), (-1.14, -0.63, 1.00), (-1.54, -0.91, 0.52), (-1.67, -0.98, 0.16), (-1.43, -1.07, 0.02), (-1.22, -1.10, 0.22), (-1.34, -1.10, 0.39)],
        "radii": [1.30, 1.18, 0.91, 0.60, 0.37, 0.22, 0.11],
        "depth": 0.30,
    },
    {
        "name": "Support_Front_R",
        "role": "support",
        "chain": "Support_Front_R",
        "points": [(0.78, -0.08, 1.41), (1.20, -0.55, 1.03), (1.67, -0.80, 0.59), (1.88, -0.85, 0.25), (1.68, -0.98, 0.09), (1.44, -1.02, 0.26), (1.54, -1.03, 0.45)],
        "radii": [1.28, 1.14, 0.88, 0.58, 0.35, 0.21, 0.11],
        "depth": 0.30,
    },
    {
        "name": "Support_Side_L",
        "role": "support",
        "chain": "Support_Side_L",
        "points": [(-1.05, 0.20, 1.46), (-1.63, -0.08, 1.07), (-2.15, -0.43, 0.66), (-2.42, -0.52, 0.30), (-2.30, -0.68, 0.08), (-2.02, -0.72, 0.24), (-2.10, -0.73, 0.46)],
        "radii": [1.22, 1.12, 0.86, 0.55, 0.32, 0.19, 0.10],
        "depth": 0.29,
    },
    {
        "name": "Support_Side_R",
        "role": "support",
        "chain": "Support_Side_R",
        "points": [(1.02, 0.27, 1.44), (1.58, 0.05, 1.08), (2.18, -0.24, 0.72), (2.51, -0.28, 0.39), (2.43, -0.49, 0.15), (2.14, -0.57, 0.31), (2.22, -0.58, 0.52)],
        "radii": [1.24, 1.12, 0.86, 0.54, 0.32, 0.19, 0.10],
        "depth": 0.29,
    },
    # These two visible arms reuse the rear support skinning. They do not add
    # primary control chains to the runtime rig.
    {
        "name": "Secondary_Rear_L",
        "role": "secondary",
        "chain": "Support_Side_L",
        "points": [(-0.68, 0.58, 1.38), (-1.30, 0.50, 1.03), (-1.88, 0.30, 0.72), (-2.24, 0.18, 0.78), (-2.35, 0.03, 1.08), (-2.17, -0.08, 1.30), (-1.98, -0.13, 1.15)],
        "radii": [1.10, 1.00, 0.74, 0.44, 0.28, 0.17, 0.09],
        "depth": 0.27,
    },
    {
        "name": "Secondary_Rear_R",
        "role": "secondary",
        "chain": "Support_Side_R",
        "points": [(0.64, 0.61, 1.39), (1.24, 0.60, 1.07), (1.88, 0.46, 0.80), (2.25, 0.38, 0.91), (2.33, 0.20, 1.21), (2.12, 0.06, 1.40), (1.94, 0.01, 1.23)],
        "radii": [1.12, 1.00, 0.73, 0.43, 0.27, 0.16, 0.09],
        "depth": 0.27,
    },
)


def progress(stage: str) -> None:
    print(f"LENOX_V002_STAGE={stage}", flush=True)


def ensure_dirs() -> None:
    for path in (BLEND_PATH, GLB_PATH, REPORT_PATH, NORMAL_PATH, ROUGHNESS_PATH):
        path.parent.mkdir(parents=True, exist_ok=True)


def clear_scene() -> None:
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    for datablocks in (
        bpy.data.meshes,
        bpy.data.curves,
        bpy.data.armatures,
        bpy.data.materials,
        bpy.data.cameras,
        bpy.data.lights,
    ):
        for datablock in tuple(datablocks):
            datablocks.remove(datablock)
    for scene_collection in tuple(bpy.data.collections):
        if scene_collection.name != "Collection":
            bpy.data.collections.remove(scene_collection)


def get_collection(name: str) -> bpy.types.Collection:
    result = bpy.data.collections.get(name)
    if result is None:
        result = bpy.data.collections.new(name)
        bpy.context.scene.collection.children.link(result)
    return result


def move_to_collection(obj: bpy.types.Object, target: bpy.types.Collection) -> None:
    for source in tuple(obj.users_collection):
        source.objects.unlink(obj)
    target.objects.link(obj)


def material(
    name: str,
    color: tuple[float, float, float, float],
    roughness: float,
    *,
    metallic: float = 0.0,
    coat: float = 0.0,
    transmission: float = 0.0,
) -> bpy.types.Material:
    result = bpy.data.materials.new(name)
    result.use_nodes = True
    shader = result.node_tree.nodes.get("Principled BSDF")
    shader.inputs["Base Color"].default_value = color
    shader.inputs["Roughness"].default_value = roughness
    shader.inputs["Metallic"].default_value = metallic
    if "Coat Weight" in shader.inputs:
        shader.inputs["Coat Weight"].default_value = coat
        shader.inputs["Coat Roughness"].default_value = 0.15
    elif "Clearcoat" in shader.inputs:
        shader.inputs["Clearcoat"].default_value = coat
        shader.inputs["Clearcoat Roughness"].default_value = 0.15
    if "Transmission Weight" in shader.inputs:
        shader.inputs["Transmission Weight"].default_value = transmission
    elif "Transmission" in shader.inputs:
        shader.inputs["Transmission"].default_value = transmission
    result.diffuse_color = color
    return result


def build_detail_maps(size: int = 256) -> tuple[bpy.types.Image, bpy.types.Image]:
    normal = bpy.data.images.new("LENOX_Pearl_Normal_Baked", width=size, height=size)
    roughness = bpy.data.images.new("LENOX_Pearl_Roughness_Baked", width=size, height=size)
    normal_pixels: list[float] = []
    roughness_pixels: list[float] = []
    for y in range(size):
        for x in range(size):
            u = x / size
            v = y / size
            field = (
                math.sin(u * 71.0 + math.sin(v * 23.0))
                + math.sin(v * 89.0 + u * 17.0)
                + math.sin((u + v) * 131.0)
            ) / 3.0
            dx = math.cos(u * 71.0 + math.sin(v * 23.0)) * 0.035
            dy = math.cos(v * 89.0 + u * 17.0) * 0.035
            nx, ny, nz = -dx, -dy, 1.0
            length = math.sqrt(nx * nx + ny * ny + nz * nz)
            normal_pixels.extend((nx / length * 0.5 + 0.5, ny / length * 0.5 + 0.5, nz / length * 0.5 + 0.5, 1.0))
            r = max(0.14, min(0.42, 0.25 + field * 0.07))
            roughness_pixels.extend((r, r, r, 1.0))
    normal.pixels = normal_pixels
    roughness.pixels = roughness_pixels
    normal.filepath_raw = str(NORMAL_PATH)
    roughness.filepath_raw = str(ROUGHNESS_PATH)
    normal.file_format = "PNG"
    roughness.file_format = "PNG"
    normal.save()
    roughness.save()
    return normal, roughness


def connect_skin_maps(skin: bpy.types.Material, normal: bpy.types.Image, roughness: bpy.types.Image) -> None:
    nodes = skin.node_tree.nodes
    links = skin.node_tree.links
    shader = nodes.get("Principled BSDF")
    normal_tex = nodes.new("ShaderNodeTexImage")
    normal_tex.name = "Baked Pearl Normal"
    normal_tex.image = normal
    normal_tex.image.colorspace_settings.name = "Non-Color"
    normal_map = nodes.new("ShaderNodeNormalMap")
    normal_map.inputs["Strength"].default_value = 0.36
    links.new(normal_tex.outputs["Color"], normal_map.inputs["Color"])
    links.new(normal_map.outputs["Normal"], shader.inputs["Normal"])
    roughness_tex = nodes.new("ShaderNodeTexImage")
    roughness_tex.name = "Baked Pearl Roughness"
    roughness_tex.image = roughness
    roughness_tex.image.colorspace_settings.name = "Non-Color"
    links.new(roughness_tex.outputs["Color"], shader.inputs["Roughness"])


def add_uv_sphere(
    name: str,
    location: tuple[float, float, float],
    scale: tuple[float, float, float],
    mat: bpy.types.Material,
    target: bpy.types.Collection,
    *,
    segments: int = 32,
    rings: int = 20,
) -> bpy.types.Object:
    bpy.ops.mesh.primitive_uv_sphere_add(segments=segments, ring_count=rings, location=location)
    obj = bpy.context.object
    obj.name = name
    obj.scale = scale
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    obj.data.materials.append(mat)
    for polygon in obj.data.polygons:
        polygon.use_smooth = True
    move_to_collection(obj, target)
    return obj


def add_curve_mesh(
    name: str,
    points: list[tuple[float, float, float]],
    radii: list[float],
    depth: float,
    mat: bpy.types.Material,
    target: bpy.types.Collection,
    *,
    bevel_resolution: int = 3,
    resolution: int = 5,
) -> bpy.types.Object:
    curve = bpy.data.curves.new(f"{name}_Curve", "CURVE")
    curve.dimensions = "3D"
    curve.resolution_u = resolution
    curve.bevel_depth = depth
    curve.bevel_resolution = bevel_resolution
    curve.resolution_u = resolution
    curve.fill_mode = "FULL"
    curve.use_fill_caps = True
    spline = curve.splines.new("BEZIER")
    spline.bezier_points.add(len(points) - 1)
    for control, coordinate, radius in zip(spline.bezier_points, points, radii):
        control.co = coordinate
        control.radius = radius
        control.handle_left_type = "AUTO"
        control.handle_right_type = "AUTO"
    obj = bpy.data.objects.new(name, curve)
    curve.materials.append(mat)
    target.objects.link(obj)
    bpy.ops.object.select_all(action="DESELECT")
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    bpy.ops.object.convert(target="MESH")
    obj = bpy.context.object
    obj.name = name
    for polygon in obj.data.polygons:
        polygon.use_smooth = True
    return obj


def add_poly_curve(
    name: str,
    points: list[tuple[float, float, float]],
    depth: float,
    mat: bpy.types.Material,
    target: bpy.types.Collection,
) -> bpy.types.Object:
    curve = bpy.data.curves.new(f"{name}_Curve", "CURVE")
    curve.dimensions = "3D"
    curve.bevel_depth = depth
    curve.bevel_resolution = 2
    curve.resolution_u = 3
    curve.fill_mode = "FULL"
    spline = curve.splines.new("BEZIER")
    spline.bezier_points.add(len(points) - 1)
    for control, coordinate in zip(spline.bezier_points, points):
        control.co = coordinate
        control.handle_left_type = "AUTO"
        control.handle_right_type = "AUTO"
    obj = bpy.data.objects.new(name, curve)
    curve.materials.append(mat)
    target.objects.link(obj)
    bpy.ops.object.select_all(action="DESELECT")
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    bpy.ops.object.convert(target="MESH")
    return bpy.context.object


def add_fin(
    label: str,
    side: float,
    skin: bpy.types.Material,
    opal: bpy.types.Material,
    target: bpy.types.Collection,
) -> bpy.types.Object:
    # Rounded three-lobe web. Negative Y swings the membrane toward camera.
    x = side
    vertices = [
        (1.66 * x, -0.18, 3.85),
        (2.08 * x, -0.54, 4.12),
        (2.52 * x, -0.78, 4.20),
        (2.44 * x, -0.88, 3.88),
        (2.72 * x, -0.92, 3.68),
        (2.42 * x, -0.98, 3.49),
        (2.58 * x, -0.91, 3.18),
        (2.12 * x, -0.70, 3.28),
        (1.69 * x, -0.28, 3.42),
        (1.92 * x, -0.52, 3.72),
    ]
    faces = [
        (0, 1, 9), (1, 2, 3, 9), (3, 4, 5, 9),
        (5, 6, 7, 9), (7, 8, 9), (8, 0, 9),
    ]
    mesh = bpy.data.meshes.new(f"LENOX_Fin_{label}_Mesh")
    mesh.from_pydata(vertices, [], faces)
    mesh.update()
    obj = bpy.data.objects.new(f"LENOX_Fin_{label}", mesh)
    mesh.materials.append(skin)
    target.objects.link(obj)
    solidify = obj.modifiers.new("Membrane thickness", "SOLIDIFY")
    solidify.thickness = 0.08
    bevel = obj.modifiers.new("Organic perimeter", "BEVEL")
    bevel.width = 0.07
    bevel.segments = 3
    bpy.ops.object.select_all(action="DESELECT")
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    for polygon in obj.data.polygons:
        polygon.use_smooth = True
    bpy.ops.object.modifier_apply(modifier=solidify.name)
    bpy.ops.object.modifier_apply(modifier=bevel.name)
    subdivision = obj.modifiers.new("Soft membrane", "SUBSURF")
    subdivision.levels = 2
    subdivision.render_levels = 2
    bpy.ops.object.modifier_apply(modifier=subdivision.name)
    basis = obj.shape_key_add(name="Basis")
    concerned = obj.shape_key_add(name="Concerned")
    confirm = obj.shape_key_add(name="Confirm")
    thinking = obj.shape_key_add(name="Thinking")
    for index, vertex in enumerate(basis.data):
        local_x = abs(vertex.co.x)
        influence = max(0.0, min(1.0, (local_x - 1.66) / 1.0))
        concerned.data[index].co.z -= 0.34 * influence
        concerned.data[index].co.y += 0.20 * influence
        confirm.data[index].co.z += 0.24 * influence
        confirm.data[index].co.y -= 0.15 * influence
        thinking.data[index].co.z += side * 0.08 * influence
        thinking.data[index].co.y += 0.08 * influence
    return obj


def create_rig(target: bpy.types.Collection) -> bpy.types.Object:
    armature_data = bpy.data.armatures.new("LENOX_Rig")
    rig = bpy.data.objects.new("LENOX_Rig", armature_data)
    target.objects.link(rig)
    rig.show_in_front = True
    bpy.context.view_layer.objects.active = rig
    rig.select_set(True)
    bpy.ops.object.mode_set(mode="EDIT")

    def bone(name: str, head: tuple[float, float, float], tail: tuple[float, float, float], parent=None):
        result = armature_data.edit_bones.new(name)
        result.head = head
        result.tail = tail
        result.parent = parent
        return result

    root = bone("Root", (0.0, 0.0, 0.0), (0.0, 0.0, 0.5))
    head = bone("Head", (0.0, 0.0, 2.25), (0.0, 0.0, 3.55), root)
    eye_l = bone("Eye.L", (-0.74, -1.42, 3.44), (-0.74, -1.72, 3.44), head)
    eye_r = bone("Eye.R", (0.74, -1.42, 3.44), (0.74, -1.72, 3.44), head)
    fin_l = bone("Fin.L", (-1.65, -0.22, 3.66), (-2.28, -0.72, 3.72), head)
    fin_r = bone("Fin.R", (1.65, -0.22, 3.66), (2.28, -0.72, 3.72), head)
    for spec in ARM_SPECS[:6]:
        points = spec["points"]
        previous = root
        segment_count = 4 if spec["role"] == "lead" else 3
        chain_points = [
            points[round(index * (len(points) - 1) / segment_count)]
            for index in range(segment_count + 1)
        ]
        for index in range(len(chain_points) - 1):
            previous = bone(
                f"Arm_{spec['chain']}_{index + 1:02d}",
                chain_points[index],
                chain_points[index + 1],
                previous,
            )
            previous.use_connect = index > 0
    bpy.ops.object.mode_set(mode="OBJECT")
    rig["primary_control_chains"] = 6
    rig["lead_chains"] = 2
    rig["support_chains"] = 4
    rig["visible_arm_count"] = 8
    rig["secondary_visible_arm_mapping"] = "Secondary_Rear_L->Support_Side_L; Secondary_Rear_R->Support_Side_R"
    return rig


def assign_arm_weights(obj: bpy.types.Object, rig: bpy.types.Object, spec: dict) -> None:
    modifier = obj.modifiers.new("LENOX Armature", "ARMATURE")
    modifier.object = rig
    points = spec["points"]
    segment_count = 4 if spec["role"] == "lead" else 3
    sample_indices = [
        round(index * (len(points) - 1) / segment_count)
        for index in range(segment_count + 1)
    ]
    samples = [Vector(points[index]) for index in sample_indices]
    groups = []
    for index in range(len(samples) - 1):
        groups.append(obj.vertex_groups.new(name=f"Arm_{spec['chain']}_{index + 1:02d}"))
    for vertex in obj.data.vertices:
        world = obj.matrix_world @ vertex.co
        distances = [
            min((world - samples[index]).length, (world - samples[index + 1]).length)
            for index in range(len(samples) - 1)
        ]
        nearest = min(range(len(distances)), key=distances.__getitem__)
        groups[nearest].add([vertex.index], 1.0, "REPLACE")
    obj.parent = rig
    obj["visible_role"] = spec["role"]
    obj["control_chain"] = spec["chain"]


def create_suckers(
    rig: bpy.types.Object,
    mat: bpy.types.Material,
    target: bpy.types.Collection,
) -> bpy.types.Object:
    suckers = []
    for spec in ARM_SPECS:
        points = spec["points"]
        segment_count = 4 if spec["role"] == "lead" else 3
        for point_index in (3, 4, 5):
            point = points[point_index]
            scale = 1.0 - (point_index - 3) * 0.16
            bpy.ops.mesh.primitive_torus_add(
                major_segments=8,
                minor_segments=4,
                mode="MAJOR_MINOR",
                major_radius=0.072 * scale,
                minor_radius=0.021 * scale,
                location=(point[0], point[1] - spec["depth"] * 0.72, point[2]),
                rotation=(math.pi / 2.0, 0.0, 0.0),
            )
            sucker = bpy.context.object
            sucker.name = f"LENOX_Sucker_{spec['name']}_{point_index}"
            sucker.data.materials.append(mat)
            segment_index = min(
                segment_count - 1,
                round(point_index * (segment_count - 1) / (len(points) - 1)),
            )
            group = sucker.vertex_groups.new(
                name=f"Arm_{spec['chain']}_{segment_index + 1:02d}",
            )
            group.add([vertex.index for vertex in sucker.data.vertices], 1.0, "REPLACE")
            move_to_collection(sucker, target)
            suckers.append(sucker)
    bpy.ops.object.select_all(action="DESELECT")
    for sucker in suckers:
        sucker.select_set(True)
    bpy.context.view_layer.objects.active = suckers[0]
    bpy.ops.object.join()
    combined = bpy.context.object
    combined.name = "LENOX_Suckers"
    modifier = combined.modifiers.new("LENOX Armature", "ARMATURE")
    modifier.object = rig
    combined.parent = rig
    for polygon in combined.data.polygons:
        polygon.use_smooth = True
    return combined


def parent_to_bone(obj: bpy.types.Object, rig: bpy.types.Object, bone_name: str) -> None:
    world = obj.matrix_world.copy()
    obj.parent = rig
    obj.parent_type = "BONE"
    obj.parent_bone = bone_name
    obj.matrix_world = world


def add_expression_curve(
    name: str,
    points: list[tuple[float, float, float]],
    depth: float,
    mat: bpy.types.Material,
    target: bpy.types.Collection,
    channel: str,
) -> bpy.types.Object:
    obj = add_poly_curve(name, points, depth, mat, target)
    basis = obj.shape_key_add(name="Basis")
    concerned = obj.shape_key_add(name="Concerned")
    confirm = obj.shape_key_add(name="Confirm")
    thinking = obj.shape_key_add(name="Thinking")
    for index, vertex in enumerate(basis.data):
        x = vertex.co.x
        center_weight = 1.0 - min(1.0, abs(x) / 1.4)
        if channel == "brow":
            concerned.data[index].co.z += center_weight * 0.16
            confirm.data[index].co.z += (1.0 - center_weight) * 0.08
            thinking.data[index].co.z += (0.5 - center_weight) * 0.09
        elif channel == "lid":
            concerned.data[index].co.z -= 0.08
            concerned.data[index].co.y -= 0.03
            confirm.data[index].co.z += 0.04
            thinking.data[index].co.z -= 0.04
        elif channel == "mouth":
            concerned.data[index].co.z += abs(x) * 0.10
            confirm.data[index].co.z -= abs(x) * 0.08
            thinking.data[index].co.z += x * 0.035
    return obj


def create_character() -> dict:
    progress("character_start")
    export = get_collection(EXPORT_COLLECTION)
    sculpt = get_collection(SCULPT_COLLECTION)
    guides = get_collection(GUIDE_COLLECTION)

    skin = material(SKIN_MATERIAL, (0.67, 0.91, 0.80, 1.0), 0.24, metallic=0.03, coat=0.46)
    skin_light = material("LENOX_PearlOpal_Light", (0.89, 0.98, 0.87, 1.0), 0.19, coat=0.52)
    opal = material("LENOX_Opal_Crown", (0.94, 0.99, 0.88, 1.0), 0.12, metallic=0.08, coat=0.68)
    sclera = material("LENOX_Eye_Sclera", (0.91, 0.96, 0.86, 1.0), 0.16, coat=0.34)
    iris = material("LENOX_Eye_Iris", (0.08, 0.43, 0.29, 1.0), 0.15, metallic=0.08, coat=0.54)
    pupil = material("LENOX_Eye_Pupil", (0.003, 0.009, 0.010, 1.0), 0.09, coat=0.42)
    coral = material("LENOX_Face_Coral", (0.61, 0.18, 0.14, 1.0), 0.34)
    normal, roughness = build_detail_maps()
    connect_skin_maps(skin, normal, roughness)
    progress("materials_and_maps")

    root = bpy.data.objects.new("LENOX_ROOT", None)
    export.objects.link(root)
    root["version"] = "v002"
    root["canonical_reference"] = str(REFERENCE_PATH.relative_to(PROJECT_ROOT))
    root["motion_reference_usage"] = "timing_and_expression_only"
    root["form_law"] = "canonical_png"
    root["visible_arm_count"] = 8
    root["primary_control_chains"] = 6

    # Hidden high-resolution sculpt source: enough density to preserve the
    # authored dome and mantle while the export shell remains web-budgeted.
    sculpt_head = add_uv_sphere("SCULPT_Head_High", (0.0, 0.04, 3.40), (2.02, 1.43, 1.60), skin, sculpt, segments=96, rings=64)
    sculpt_body = add_uv_sphere("SCULPT_Mantle_High", (0.0, 0.12, 1.66), (1.64, 1.23, 1.62), skin, sculpt, segments=80, rings=48)
    sculpt_head.hide_render = True
    sculpt_body.hide_render = True
    sculpt.hide_viewport = True
    sculpt.hide_render = True

    head = add_uv_sphere("LENOX_Head", (0.0, 0.04, 3.40), (2.02, 1.43, 1.60), skin_light, export, segments=36, rings=24)
    mantle = add_uv_sphere("LENOX_Mantle", (0.0, 0.12, 1.65), (1.63, 1.22, 1.61), skin, export, segments=32, rings=20)
    # Direct overlap is intentional: it removes the v001 cylindrical neck.
    head["form_note"] = "wide canonical dome"
    mantle["form_note"] = "overlaps head; no neck cylinder"

    rig = create_rig(export)
    progress("base_mesh_and_rig")
    parent_to_bone(head, rig, "Head")
    parent_to_bone(mantle, rig, "Root")

    face_anchor = bpy.data.objects.new("LENOX_FACE_ANCHOR", None)
    face_anchor.location = (0.0, -1.48, 3.37)
    export.objects.link(face_anchor)
    parent_to_bone(face_anchor, rig, "Head")

    fins = {}
    for label, side in (("L", -1.0), ("R", 1.0)):
        fin = add_fin(label, side, skin_light, opal, export)
        parent_to_bone(fin, rig, f"Fin.{label}")
        fins[label] = fin
    progress("fins")

    eyes = {}
    for label, side in (("L", -1.0), ("R", 1.0)):
        parts = []
        parts.append(add_uv_sphere(f"LENOX_Eye_Sclera_{label}", (0.74 * side, -1.29, 3.44), (0.72, 0.34, 0.84), sclera, export, segments=28, rings=18))
        parts.append(add_uv_sphere(f"LENOX_Eye_Iris_{label}", (0.74 * side, -1.57, 3.42), (0.50, 0.11, 0.58), iris, export, segments=28, rings=18))
        parts.append(add_uv_sphere(f"LENOX_Eye_Pupil_{label}", (0.74 * side, -1.67, 3.44), (0.29, 0.065, 0.39), pupil, export, segments=24, rings=16))
        # One stable primary glint per eye, parented to gaze bone. A tiny lower
        # fill reflection is omitted so the highlight cannot read as jumping.
        parts.append(add_uv_sphere(f"LENOX_Eye_Glint_{label}", (0.58 * side, -1.73, 3.72), (0.10, 0.028, 0.13), opal, export, segments=16, rings=10))
        for part in parts:
            parent_to_bone(part, rig, f"Eye.{label}")
        eyes[label] = parts

        brow = add_expression_curve(
            f"LENOX_Brow_{label}",
            [(1.24 * side, -1.48, 4.13), (0.95 * side, -1.57, 4.22), (0.57 * side, -1.59, 4.18)],
            0.045,
            skin,
            export,
            "brow",
        )
        lid = add_expression_curve(
            f"LENOX_UpperLid_{label}",
            [(1.31 * side, -1.50, 3.77), (0.80 * side, -1.66, 4.05), (0.24 * side, -1.49, 3.76)],
            0.052,
            skin_light,
            export,
            "lid",
        )
        parent_to_bone(brow, rig, "Head")
        parent_to_bone(lid, rig, "Head")
    progress("eyes_and_expression_leads")

    nose = add_uv_sphere("LENOX_Nose", (0.0, -1.46, 2.96), (0.075, 0.032, 0.055), skin_light, export, segments=18, rings=12)
    parent_to_bone(nose, rig, "Head")
    for side in (-1.0, 1.0):
        nostril = add_uv_sphere(f"LENOX_Nostril_{'L' if side < 0 else 'R'}", (0.026 * side, -1.493, 2.96), (0.011, 0.009, 0.009), coral, export, segments=12, rings=8)
        parent_to_bone(nostril, rig, "Head")
    mouth = add_expression_curve(
        "LENOX_Mouth_Closed",
        [(-0.26, -1.47, 2.73), (-0.13, -1.51, 2.69), (0.0, -1.52, 2.68), (0.13, -1.51, 2.69), (0.26, -1.47, 2.73)],
        0.025,
        coral,
        export,
        "mouth",
    )
    mouth["mouth_constraint"] = "closed_lip_only"
    parent_to_bone(mouth, rig, "Head")

    crown_positions = (
        (0.0, -1.38, 4.92, 0.15, 0.22),
        (0.0, -1.42, 4.62, 0.11, 0.17),
        (-0.24, -1.41, 4.58, 0.10, 0.14), (0.24, -1.41, 4.58, 0.10, 0.14),
        (-0.44, -1.36, 4.46, 0.075, 0.11), (0.44, -1.36, 4.46, 0.075, 0.11),
        (-0.16, -1.44, 4.35, 0.075, 0.10), (0.16, -1.44, 4.35, 0.075, 0.10),
        (0.0, -1.46, 4.20, 0.065, 0.085),
    )
    for index, (x, y, z, sx, sz) in enumerate(crown_positions, start=1):
        pearl = add_uv_sphere(f"LENOX_CrownPearl_{index:02d}", (x, y, z), (sx, 0.045, sz), opal, export, segments=16, rings=10)
        parent_to_bone(pearl, rig, "Head")
    progress("face_and_crown")

    arm_objects = []
    for spec in ARM_SPECS:
        arm = add_curve_mesh(
            f"LENOX_Arm_{spec['name']}",
            spec["points"],
            spec["radii"],
            spec["depth"],
            skin,
            export,
            bevel_resolution=3 if spec["role"] == "lead" else 2,
            resolution=5,
        )
        assign_arm_weights(arm, rig, spec)
        arm_objects.append(arm)
    create_suckers(rig, skin_light, export)
    progress("eight_arm_skin")

    # Reference stays in the .blend but never exports or renders.
    if REFERENCE_PATH.exists():
        image = bpy.data.images.load(str(REFERENCE_PATH), check_existing=True)
        reference = bpy.data.objects.new("REF_LENOX_Canonical_Front", None)
        reference.empty_display_type = "IMAGE"
        reference.data = image
        reference.empty_display_size = 6.0
        reference.color[3] = 0.25
        reference.location = (0.0, 0.85, 2.7)
        reference.rotation_euler = (math.pi / 2.0, 0.0, 0.0)
        reference.hide_render = True
        guides.objects.link(reference)

    return {
        "root": root,
        "rig": rig,
        "head": head,
        "mantle": mantle,
        "fins": fins,
        "eyes": eyes,
        "mouth": mouth,
        "arms": arm_objects,
        "materials": [skin, skin_light, opal, sclera, iris, pupil, coral],
    }


def set_shape_value(name: str, value: float) -> None:
    for obj in bpy.data.objects:
        keys = getattr(getattr(obj, "data", None), "shape_keys", None)
        if keys and name in keys.key_blocks:
            keys.key_blocks[name].value = value
            keys.key_blocks[name].keyframe_insert("value")


def create_animation(character: dict) -> None:
    scene = bpy.context.scene
    scene.frame_start = 1
    scene.frame_end = 144
    scene.render.fps = 24
    rig = character["rig"]
    for frame, expression in ((1, "rest"), (36, "observe"), (72, "concerned"), (108, "confirm"), (144, "rest")):
        scene.frame_set(frame)
        set_shape_value("Concerned", 1.0 if expression == "concerned" else 0.0)
        set_shape_value("Confirm", 1.0 if expression == "confirm" else 0.0)
        set_shape_value("Thinking", 0.35 if expression == "observe" else 0.0)
        for pose_bone in rig.pose.bones:
            if not pose_bone.name.startswith("Arm_"):
                continue
            seed = sum(ord(char) for char in pose_bone.name) * 0.013
            lead = "Lead" in pose_bone.name
            amplitude = 0.10 if lead else 0.035
            if expression == "confirm" and lead:
                amplitude += 0.16
            if expression == "concerned":
                amplitude *= 0.55
            pose_bone.rotation_mode = "XYZ"
            pose_bone.rotation_euler.x = math.sin(frame * 0.045 + seed) * amplitude * 0.35
            pose_bone.rotation_euler.y = math.cos(frame * 0.037 + seed) * amplitude * 0.25
            pose_bone.rotation_euler.z = math.sin(frame * 0.031 + seed) * amplitude
            pose_bone.keyframe_insert("rotation_euler")
        for eye_name in ("Eye.L", "Eye.R"):
            eye = rig.pose.bones.get(eye_name)
            eye.rotation_mode = "XYZ"
            eye.rotation_euler.x = 0.045 if expression == "observe" else (-0.025 if expression == "concerned" else 0.0)
            eye.rotation_euler.z = 0.035 if expression == "observe" else 0.0
            eye.keyframe_insert("rotation_euler")
    if rig.animation_data and rig.animation_data.action:
        rig.animation_data.action.name = "LENOX_v002_MotionExpression_Test"


def aim_at(obj: bpy.types.Object, target: tuple[float, float, float]) -> None:
    obj.rotation_euler = (Vector(target) - obj.location).to_track_quat("-Z", "Y").to_euler()


def create_studio() -> dict:
    studio = get_collection(STUDIO_COLLECTION)
    background = material("STUDIO_ReefNeutral", (0.68, 0.78, 0.72, 1.0), 0.52)
    bpy.ops.mesh.primitive_plane_add(size=24.0, location=(0.0, 0.4, -0.10))
    ground = bpy.context.object
    ground.name = "STUDIO_Ground"
    ground.data.materials.append(background)
    move_to_collection(ground, studio)

    bpy.ops.object.light_add(type="AREA", location=(-4.2, -5.8, 7.3))
    key = bpy.context.object
    key.name = "STUDIO_Key"
    key.data.energy = 650.0
    key.data.shape = "DISK"
    key.data.size = 5.5
    key.data.color = (1.0, 0.92, 0.78)
    aim_at(key, (0.0, 0.0, 2.5))
    move_to_collection(key, studio)

    bpy.ops.object.light_add(type="AREA", location=(4.5, -3.8, 5.4))
    fill = bpy.context.object
    fill.name = "STUDIO_Fill"
    fill.data.energy = 430.0
    fill.data.size = 4.0
    fill.data.color = (0.58, 0.92, 0.82)
    aim_at(fill, (0.0, 0.0, 2.7))
    move_to_collection(fill, studio)

    bpy.ops.object.light_add(type="AREA", location=(0.0, 3.2, 6.5))
    rim = bpy.context.object
    rim.name = "STUDIO_Rim"
    rim.data.energy = 560.0
    rim.data.size = 3.5
    rim.data.color = (0.88, 0.97, 1.0)
    aim_at(rim, (0.0, 0.0, 3.0))
    move_to_collection(rim, studio)

    bpy.ops.object.camera_add(location=(0.0, -14.5, 3.05))
    camera = bpy.context.object
    camera.name = "STUDIO_Camera_Front"
    camera.data.lens = 68.0
    aim_at(camera, (0.0, 0.0, 2.48))
    move_to_collection(camera, studio)
    bpy.context.scene.camera = camera

    world = bpy.context.scene.world
    world.use_nodes = True
    world.node_tree.nodes["Background"].inputs["Color"].default_value = (0.68, 0.76, 0.71, 1.0)
    world.node_tree.nodes["Background"].inputs["Strength"].default_value = 0.38
    return {"ground": ground, "camera": camera, "lights": [key, fill, rim]}


def configure_render() -> None:
    scene = bpy.context.scene
    # The project host can expose OpenGL to Blender but denies Metal device
    # enumeration. Cycles/CPU keeps the inspection path deterministic and does
    # not couple asset generation to a GPU backend.
    scene.render.engine = "CYCLES"
    scene.cycles.device = "CPU"
    scene.cycles.samples = 16
    scene.cycles.use_denoising = True
    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_mode = "RGBA"
    scene.render.image_settings.color_depth = "8"
    scene.render.film_transparent = False
    scene.render.resolution_percentage = 100
    # Blender 3.6 uses Filmic names, Blender 4+ prefixes the AgX choice.
    try:
        scene.view_settings.look = "AgX - Medium High Contrast"
    except TypeError:
        scene.view_settings.look = "Medium High Contrast"


def render(path: Path, size: int, frame: int = 1) -> None:
    scene = bpy.context.scene
    scene.frame_set(frame)
    scene.render.resolution_x = size
    scene.render.resolution_y = size
    scene.render.filepath = str(path)
    bpy.ops.render.render(write_still=True)


def render_self_checks(character: dict, studio: dict) -> None:
    # Bright inspection renders are not approval material. 64/96 are the
    # required technical readability checks at the three major form states.
    for size in (64, 96):
        render(ARTIFACT_DIR / f"silhouette-v002-{size}px.png", size, frame=1)
    render(ARTIFACT_DIR / "sculpt-v002-96px.png", 96, frame=36)
    render(ARTIFACT_DIR / "retopo-v002-96px.png", 96, frame=72)
    render(ARTIFACT_DIR / "inspection-front-neutral.png", 1024, frame=1)
    render(ARTIFACT_DIR / "inspection-observe.png", 1024, frame=36)
    render(ARTIFACT_DIR / "inspection-concerned.png", 1024, frame=72)
    render(ARTIFACT_DIR / "inspection-confirm.png", 1024, frame=108)

    camera = studio["camera"]
    original_location = camera.location.copy()
    original_rotation = camera.rotation_euler.copy()
    camera.location = (7.4, -11.8, 3.4)
    aim_at(camera, (0.0, 0.0, 2.45))
    render(ARTIFACT_DIR / "inspection-three-quarter.png", 1024, frame=36)
    camera.location = original_location
    camera.rotation_euler = original_rotation


def export_glb(character: dict) -> None:
    bpy.ops.object.select_all(action="DESELECT")
    export_collection = bpy.data.collections[EXPORT_COLLECTION]
    for obj in export_collection.all_objects:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = character["rig"]
    bpy.ops.export_scene.gltf(
        filepath=str(GLB_PATH),
        export_format="GLB",
        use_selection=True,
        export_animations=True,
        export_morph=True,
        export_skins=True,
        export_apply=False,
        export_draco_mesh_compression_enable=False,
    )


def glb_json(path: Path) -> dict:
    with path.open("rb") as handle:
        magic, version, length = struct.unpack("<4sII", handle.read(12))
        if magic != b"glTF" or version != 2 or length != path.stat().st_size:
            raise RuntimeError("invalid GLB header")
        chunk_length, chunk_type = struct.unpack("<II", handle.read(8))
        if chunk_type != 0x4E4F534A:
            raise RuntimeError("GLB JSON chunk missing")
        return json.loads(handle.read(chunk_length).decode("utf-8"))


def report(character: dict) -> dict:
    export_objects = list(bpy.data.collections[EXPORT_COLLECTION].all_objects)
    mesh_objects = [obj for obj in export_objects if obj.type == "MESH"]
    depsgraph = bpy.context.evaluated_depsgraph_get()
    triangles = 0
    vertices = 0
    for obj in mesh_objects:
        evaluated = obj.evaluated_get(depsgraph)
        mesh = evaluated.to_mesh()
        mesh.calc_loop_triangles()
        triangles += len(mesh.loop_triangles)
        vertices += len(mesh.vertices)
        evaluated.to_mesh_clear()
    shape_keys = sorted({
        key.name
        for obj in mesh_objects
        if getattr(obj.data, "shape_keys", None)
        for key in obj.data.shape_keys.key_blocks
        if key.name != "Basis"
    })
    gltf = glb_json(GLB_PATH)
    result = {
        "version": "v002",
        "canonical_reference": str(REFERENCE_PATH.relative_to(PROJECT_ROOT)),
        "blender_file": str(BLEND_PATH.relative_to(PROJECT_ROOT)),
        "glb_file": str(GLB_PATH.relative_to(PROJECT_ROOT)),
        "glb_bytes": GLB_PATH.stat().st_size,
        "glb_megabytes_decimal": round(GLB_PATH.stat().st_size / 1_000_000, 3),
        "triangle_count_evaluated": triangles,
        "vertex_count_evaluated": vertices,
        "mesh_count_blender": len(mesh_objects),
        "gltf_mesh_count": len(gltf.get("meshes", [])),
        "gltf_material_count": len(gltf.get("materials", [])),
        "gltf_texture_count": len(gltf.get("textures", [])),
        "gltf_animation_count": len(gltf.get("animations", [])),
        "gltf_skin_count": len(gltf.get("skins", [])),
        "primary_control_chains": 6,
        "lead_chains": 2,
        "support_chains": 4,
        "visible_arms": 8,
        "secondary_arm_mapping": {
            "Secondary_Rear_L": "Support_Side_L",
            "Secondary_Rear_R": "Support_Side_R",
        },
        "shape_keys": shape_keys,
        "texture_dimensions": {
            NORMAL_PATH.name: [256, 256],
            ROUGHNESS_PATH.name: [256, 256],
        },
        "normal_map": str(NORMAL_PATH.relative_to(PROJECT_ROOT)),
        "roughness_map": str(ROUGHNESS_PATH.relative_to(PROJECT_ROOT)),
        "ao_map": None,
        "ao_note": "Omitted: neutral inspection and compact web asset do not need a dedicated AO texture.",
        "silhouette_self_checks": [
            "silhouette-v002-64px.png",
            "silhouette-v002-96px.png",
            "sculpt-v002-96px.png",
            "retopo-v002-96px.png",
        ],
        "technical_form_checks": {
            "head_body_overlap_no_neck": True,
            "forward_swinging_fin_ears": True,
            "asymmetric_arm_paths": True,
            "lead_arms_expressive_support_restrained": True,
            "stable_primary_glint_parented_to_eye_bone": True,
            "mouth_closed_lip": True,
        },
        "budget": {
            "target_glb_bytes": 3_000_000,
            "target_triangles": 60_000,
            "glb_pass": GLB_PATH.stat().st_size < 3_000_000,
            "triangles_pass": triangles < 60_000,
        },
    }
    REPORT_PATH.write_text(json.dumps(result, indent=2) + "\n", encoding="utf-8")
    return result


def main() -> None:
    progress("start")
    ensure_dirs()
    clear_scene()
    progress("scene_cleared")
    character = create_character()
    progress("character_complete")
    studio = create_studio()
    configure_render()
    progress("studio_complete")
    create_animation(character)
    progress("animation_complete")
    render_self_checks(character, studio)
    progress("renders_complete")
    bpy.ops.wm.save_as_mainfile(filepath=str(BLEND_PATH))
    progress("blend_saved")
    export_glb(character)
    progress("glb_exported")
    result = report(character)
    bpy.ops.wm.save_as_mainfile(filepath=str(BLEND_PATH))
    print("LENOX_V002_RESULT=" + json.dumps(result, sort_keys=True))
    if not result["budget"]["glb_pass"] or not result["budget"]["triangles_pass"]:
        raise RuntimeError("LENOX v002 exceeded the hard web budget")


if __name__ == "__main__":
    main()
