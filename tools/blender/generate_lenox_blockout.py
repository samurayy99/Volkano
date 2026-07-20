"""Build the first authored LENOX silhouette blockout in Blender.

The canonical still is the identity source. The generated motion clip is not a
geometry source; it is only useful later for expression and timing studies.
Run this script inside Blender 5.2 through BlenderMCP.
"""

from __future__ import annotations

import math
from pathlib import Path

import bpy
from mathutils import Vector


PROJECT_ROOT = Path("/Users/lenox27/my_project")
REFERENCE_PATH = PROJECT_ROOT / "docs/character/lenox-canonical-reference.png"
BLEND_PATH = PROJECT_ROOT / "assets/lenox/lenox-blockout-v001.blend"
RENDER_PATH = PROJECT_ROOT / "artifacts/lenox-blender/lenox-blockout-v001.png"


def clear_scene() -> None:
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    for collection in tuple(bpy.data.collections):
        if collection.name != "Collection":
            bpy.data.collections.remove(collection)


def collection(name: str) -> bpy.types.Collection:
    result = bpy.data.collections.get(name)
    if result is None:
        result = bpy.data.collections.new(name)
        bpy.context.scene.collection.children.link(result)
    return result


def move_to_collection(obj: bpy.types.Object, target: bpy.types.Collection) -> None:
    for current in tuple(obj.users_collection):
        current.objects.unlink(obj)
    target.objects.link(obj)


def principled_material(
    name: str,
    color: tuple[float, float, float, float],
    *,
    roughness: float,
    metallic: float = 0.0,
    subsurface: float = 0.0,
    coat: float = 0.0,
) -> bpy.types.Material:
    material = bpy.data.materials.new(name)
    material.use_nodes = True
    shader = material.node_tree.nodes.get("Principled BSDF")
    shader.inputs["Base Color"].default_value = color
    shader.inputs["Roughness"].default_value = roughness
    shader.inputs["Metallic"].default_value = metallic
    if "Subsurface Weight" in shader.inputs:
        shader.inputs["Subsurface Weight"].default_value = subsurface
    if "Coat Weight" in shader.inputs:
        shader.inputs["Coat Weight"].default_value = coat
        shader.inputs["Coat Roughness"].default_value = 0.16
    return material


def add_uv_sphere(
    name: str,
    location: tuple[float, float, float],
    scale: tuple[float, float, float],
    material: bpy.types.Material,
    target: bpy.types.Collection,
    *,
    segments: int = 48,
    rings: int = 32,
) -> bpy.types.Object:
    bpy.ops.mesh.primitive_uv_sphere_add(
        segments=segments,
        ring_count=rings,
        location=location,
    )
    obj = bpy.context.object
    obj.name = name
    obj.scale = scale
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    for polygon in obj.data.polygons:
        polygon.use_smooth = True
    obj.data.materials.append(material)
    move_to_collection(obj, target)
    return obj


def add_curve(
    name: str,
    points: list[tuple[float, float, float]],
    radii: list[float],
    material: bpy.types.Material,
    target: bpy.types.Collection,
    *,
    bevel_depth: float,
    bevel_resolution: int = 5,
) -> bpy.types.Object:
    data = bpy.data.curves.new(name=f"{name}_Curve", type="CURVE")
    data.dimensions = "3D"
    data.resolution_u = 20
    data.bevel_depth = bevel_depth
    data.bevel_resolution = bevel_resolution
    data.resolution_u = 24
    data.fill_mode = "FULL"
    data.use_fill_caps = True
    spline = data.splines.new("BEZIER")
    spline.bezier_points.add(len(points) - 1)
    for point, coordinate, radius in zip(spline.bezier_points, points, radii):
        point.co = coordinate
        point.radius = radius
        point.handle_left_type = "AUTO"
        point.handle_right_type = "AUTO"
    obj = bpy.data.objects.new(name, data)
    data.materials.append(material)
    target.objects.link(obj)
    return obj


def add_fin(
    name: str,
    side: float,
    material: bpy.types.Material,
    ray_material: bpy.types.Material,
    target: bpy.types.Collection,
) -> bpy.types.Object:
    coordinates = [
        (1.72 * side, -0.03, 4.00),
        (2.36 * side, -0.06, 4.28),
        (2.93 * side, -0.04, 4.18),
        (2.63 * side, -0.08, 3.78),
        (3.02 * side, -0.03, 3.53),
        (2.58 * side, -0.08, 3.22),
        (2.76 * side, -0.04, 2.90),
        (2.12 * side, -0.08, 3.03),
        (1.72 * side, -0.03, 3.18),
    ]
    mesh = bpy.data.meshes.new(f"{name}_Mesh")
    mesh.from_pydata(coordinates, [], [tuple(range(len(coordinates)))])
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    mesh.materials.append(material)
    target.objects.link(obj)
    bevel = obj.modifiers.new("Soft perimeter", "BEVEL")
    bevel.width = 0.075
    bevel.segments = 3
    solidify = obj.modifiers.new("Membrane thickness", "SOLIDIFY")
    solidify.thickness = 0.075

    root = (1.82 * side, -0.12, 3.56)
    ray_ends = [coordinates[2], coordinates[4], coordinates[6]]
    for index, end in enumerate(ray_ends, start=1):
        mid = (
            (root[0] + end[0]) * 0.52,
            -0.13,
            (root[2] + end[2]) * 0.52,
        )
        add_curve(
            f"{name}_Ray_{index}",
            [root, mid, (end[0] * 0.985, -0.13, end[2] * 0.995)],
            [0.9, 0.7, 0.25],
            ray_material,
            target,
            bevel_depth=0.025,
            bevel_resolution=3,
        )
    return obj


def aim_at(obj: bpy.types.Object, target: tuple[float, float, float]) -> None:
    direction = Vector(target) - obj.location
    obj.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()


def build() -> None:
    clear_scene()
    body_collection = collection("LENOX_BLOCKOUT")
    face_collection = collection("LENOX_FACE")
    arm_collection = collection("LENOX_ARMS")
    guide_collection = collection("LENOX_GUIDES")
    studio_collection = collection("STUDIO")

    root = bpy.data.objects.new("LENOX_ROOT", None)
    root.empty_display_type = "PLAIN_AXES"
    root["phase"] = "silhouette_blockout_v001"
    root["canonical_reference"] = str(REFERENCE_PATH)
    root["visible_arm_count"] = 8
    root["runtime_mapping"] = "2 lead + 4 support"
    root["motion_video_is_geometry_source"] = False
    body_collection.objects.link(root)

    pearl = principled_material(
        "LENOX_Pearl_Skin",
        (0.53, 0.88, 0.78, 1.0),
        roughness=0.25,
        subsurface=0.12,
        coat=0.36,
    )
    pearl_light = principled_material(
        "LENOX_Pearl_Light",
        (0.86, 0.98, 0.89, 1.0),
        roughness=0.2,
        subsurface=0.08,
        coat=0.4,
    )
    iris = principled_material(
        "LENOX_Iris",
        (0.08, 0.42, 0.30, 1.0),
        roughness=0.12,
        metallic=0.08,
        coat=0.55,
    )
    pupil = principled_material(
        "LENOX_Pupil",
        (0.003, 0.008, 0.012, 1.0),
        roughness=0.08,
        coat=0.5,
    )
    coral = principled_material(
        "LENOX_Coral_Accent",
        (0.72, 0.22, 0.18, 1.0),
        roughness=0.3,
        subsurface=0.05,
    )
    opal = principled_material(
        "LENOX_Opal_Marking",
        (0.83, 0.98, 0.94, 1.0),
        roughness=0.12,
        metallic=0.12,
        coat=0.65,
    )

    head = add_uv_sphere(
        "LENOX_Head",
        (0.0, 0.0, 3.35),
        (2.05, 1.28, 1.68),
        pearl_light,
        body_collection,
    )
    body = add_uv_sphere(
        "LENOX_Mantle",
        (0.0, 0.05, 1.55),
        (1.12, 0.82, 1.42),
        pearl,
        body_collection,
    )
    head.parent = root
    body.parent = root

    add_fin("LENOX_Fin_L", -1.0, pearl, opal, body_collection).parent = root
    add_fin("LENOX_Fin_R", 1.0, pearl, opal, body_collection).parent = root

    for side, label in ((-1.0, "L"), (1.0, "R")):
        white = add_uv_sphere(
            f"LENOX_EyeWhite_{label}",
            (0.78 * side, -1.16, 3.42),
            (0.72, 0.34, 0.86),
            pearl_light,
            face_collection,
        )
        eye_iris = add_uv_sphere(
            f"LENOX_Iris_{label}",
            (0.78 * side, -1.45, 3.40),
            (0.50, 0.16, 0.62),
            iris,
            face_collection,
        )
        eye_pupil = add_uv_sphere(
            f"LENOX_Pupil_{label}",
            (0.78 * side, -1.58, 3.42),
            (0.30, 0.09, 0.42),
            pupil,
            face_collection,
        )
        glint = add_uv_sphere(
            f"LENOX_Glint_{label}",
            (0.62 * side, -1.68, 3.72),
            (0.11, 0.035, 0.14),
            pearl_light,
            face_collection,
            segments=32,
            rings=20,
        )
        for eye_part in (white, eye_iris, eye_pupil, glint):
            eye_part.parent = root

    for side in (-1.0, 1.0):
        nostril = add_uv_sphere(
            f"LENOX_Nostril_{'L' if side < 0 else 'R'}",
            (0.05 * side, -1.37, 2.92),
            (0.018, 0.012, 0.014),
            coral,
            face_collection,
            segments=20,
            rings=12,
        )
        nostril.parent = root

    mouth = add_curve(
        "LENOX_Mouth_SoftSmile",
        [
            (-0.24, -1.38, 2.73),
            (-0.13, -1.43, 2.69),
            (0.0, -1.45, 2.68),
            (0.13, -1.43, 2.69),
            (0.24, -1.38, 2.73),
        ],
        [0.65, 0.8, 0.9, 0.8, 0.65],
        coral,
        face_collection,
        bevel_depth=0.027,
        bevel_resolution=4,
    )
    mouth.parent = root

    crown_marks = [
        (0.0, 4.58, 0.18, 0.28),
        (0.0, 4.29, 0.13, 0.20),
        (-0.24, 4.35, 0.11, 0.16),
        (0.24, 4.35, 0.11, 0.16),
        (-0.43, 4.20, 0.09, 0.13),
        (0.43, 4.20, 0.09, 0.13),
        (-0.17, 4.05, 0.075, 0.11),
        (0.17, 4.05, 0.075, 0.11),
        (0.0, 3.92, 0.07, 0.10),
    ]
    for index, (x, z, sx, sz) in enumerate(crown_marks, start=1):
        mark = add_uv_sphere(
            f"LENOX_CrownPearl_{index:02d}",
            (x, -1.30, z),
            (sx, 0.055, sz),
            opal,
            face_collection,
            segments=24,
            rings=16,
        )
        mark.parent = root

    arms = [
        ("Lead_L", [(-0.42, -0.48, 1.35), (-0.62, -1.00, 0.74), (-1.02, -1.18, 0.30), (-1.30, -1.05, 0.46), (-1.18, -1.10, 0.68)], [1.35, 1.2, 0.88, 0.58, 0.25], 0.30),
        ("Lead_R", [(0.40, -0.50, 1.34), (0.58, -1.05, 0.70), (0.92, -1.20, 0.26), (1.22, -1.04, 0.39), (1.17, -1.08, 0.61)], [1.35, 1.2, 0.9, 0.55, 0.24], 0.30),
        ("Support_Front_L", [(-0.70, -0.20, 1.25), (-1.08, -0.72, 0.61), (-1.60, -0.90, 0.22), (-1.86, -0.74, 0.54), (-1.67, -0.80, 0.76)], [1.25, 1.12, 0.82, 0.48, 0.20], 0.28),
        ("Support_Front_R", [(0.72, -0.18, 1.24), (1.12, -0.68, 0.58), (1.62, -0.86, 0.24), (1.92, -0.68, 0.58), (1.70, -0.76, 0.82)], [1.25, 1.08, 0.80, 0.46, 0.19], 0.28),
        ("Support_Side_L", [(-0.82, 0.08, 1.30), (-1.48, -0.05, 0.74), (-2.18, -0.34, 0.27), (-2.52, -0.15, 0.79), (-2.18, -0.30, 0.98), (-1.99, -0.39, 0.72)], [1.22, 1.1, 0.82, 0.56, 0.35, 0.18], 0.27),
        ("Support_Side_R", [(0.84, 0.10, 1.32), (1.52, 0.00, 0.77), (2.24, -0.28, 0.30), (2.58, -0.08, 0.86), (2.24, -0.22, 1.04), (2.03, -0.33, 0.76)], [1.22, 1.08, 0.80, 0.54, 0.34, 0.18], 0.27),
        ("Support_Rear_L", [(-0.72, 0.40, 1.34), (-1.30, 0.37, 0.82), (-1.92, 0.18, 0.50), (-2.18, 0.28, 0.92), (-1.96, 0.15, 1.14)], [1.12, 1.0, 0.72, 0.42, 0.17], 0.25),
        ("Support_Rear_R", [(0.74, 0.42, 1.36), (1.36, 0.40, 0.86), (1.98, 0.22, 0.54), (2.25, 0.34, 1.00), (2.00, 0.18, 1.21)], [1.12, 1.0, 0.70, 0.40, 0.17], 0.25),
    ]
    for name, points, radii, depth in arms:
        arm = add_curve(
            f"LENOX_Arm_{name}",
            points,
            radii,
            pearl,
            arm_collection,
            bevel_depth=depth,
        )
        arm.parent = root
        arm["role"] = "lead" if name.startswith("Lead") else "support"

    if REFERENCE_PATH.exists():
        image = bpy.data.images.load(str(REFERENCE_PATH), check_existing=True)
        reference = bpy.data.objects.new("REF_LENOX_Canonical_Front", None)
        reference.empty_display_type = "IMAGE"
        reference.data = image
        reference.empty_display_size = 6.2
        reference.color[3] = 0.24
        reference.location = (0.0, 1.55, 3.0)
        reference.rotation_euler = (math.pi / 2.0, 0.0, 0.0)
        reference.hide_render = True
        guide_collection.objects.link(reference)

    bpy.ops.mesh.primitive_plane_add(size=30.0, location=(0.0, 0.0, -0.08))
    ground = bpy.context.object
    ground.name = "STUDIO_Ground"
    ground.data.materials.append(
        principled_material(
            "STUDIO_Ground_Material",
            (0.06, 0.075, 0.085, 1.0),
            roughness=0.42,
        )
    )
    move_to_collection(ground, studio_collection)

    bpy.ops.object.light_add(type="AREA", location=(-4.0, -5.2, 7.5))
    key = bpy.context.object
    key.name = "STUDIO_Key"
    key.data.energy = 1100.0
    key.data.shape = "DISK"
    key.data.size = 5.0
    aim_at(key, (0.0, 0.0, 2.5))
    move_to_collection(key, studio_collection)

    bpy.ops.object.light_add(type="AREA", location=(4.5, -2.5, 4.8))
    fill = bpy.context.object
    fill.name = "STUDIO_Fill"
    fill.data.energy = 760.0
    fill.data.color = (0.48, 0.82, 1.0)
    fill.data.size = 4.0
    aim_at(fill, (0.0, 0.0, 2.5))
    move_to_collection(fill, studio_collection)

    bpy.ops.object.light_add(type="AREA", location=(0.0, 4.0, 6.0))
    rim = bpy.context.object
    rim.name = "STUDIO_Rim"
    rim.data.energy = 1200.0
    rim.data.color = (1.0, 0.48, 0.35)
    rim.data.size = 3.0
    aim_at(rim, (0.0, 0.0, 3.0))
    move_to_collection(rim, studio_collection)

    bpy.ops.object.camera_add(location=(0.0, -13.5, 3.15))
    camera = bpy.context.object
    camera.name = "STUDIO_Camera_Front"
    camera.data.lens = 68.0
    aim_at(camera, (0.0, 0.0, 2.45))
    move_to_collection(camera, studio_collection)
    bpy.context.scene.camera = camera

    world = bpy.context.scene.world
    world.use_nodes = True
    world.node_tree.nodes["Background"].inputs["Color"].default_value = (0.035, 0.055, 0.07, 1.0)
    world.node_tree.nodes["Background"].inputs["Strength"].default_value = 0.28

    scene = bpy.context.scene
    scene.render.engine = "BLENDER_EEVEE"
    scene.render.resolution_x = 960
    scene.render.resolution_y = 960
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_mode = "RGBA"
    scene.render.film_transparent = False
    scene.render.filepath = str(RENDER_PATH)
    scene.render.image_settings.color_depth = "8"
    scene.view_settings.look = "AgX - Medium High Contrast"

    BLEND_PATH.parent.mkdir(parents=True, exist_ok=True)
    RENDER_PATH.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.wm.save_as_mainfile(filepath=str(BLEND_PATH))
    bpy.ops.render.render(write_still=True)
    bpy.ops.wm.save_as_mainfile(filepath=str(BLEND_PATH))

    print(f"LENOX_BLOCKOUT_BLEND={BLEND_PATH}")
    print(f"LENOX_BLOCKOUT_RENDER={RENDER_PATH}")
    print("LENOX_BLOCKOUT_OBJECTS=" + str(len(bpy.context.scene.objects)))


if __name__ == "__main__":
    build()
