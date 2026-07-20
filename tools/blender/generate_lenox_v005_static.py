"""Build the independent LENOX v005 static-form gate.

This stage deliberately creates no rig, morph targets, textures, animation or
runtime GLB. It reuses only frozen procedural helpers and naming contracts from
v002; it never executes or mutates the v004 scene pipeline.

Reference command (Blender 3.6.23):
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
import platform
import sys

import bpy
from mathutils import Vector


PROJECT_ROOT = Path(__file__).resolve().parents[2]
REFERENCE_PATH = PROJECT_ROOT / "docs/character/lenox-canonical-reference.png"
BLEND_PATH = PROJECT_ROOT / "assets/lenox/lenox-v005-clay.blend"
ARTIFACT_DIR = PROJECT_ROOT / "artifacts/lenox-blender/v005/static-form"
REPORT_PATH = ARTIFACT_DIR / "static-form-report.json"
MANIFEST_PATH = ARTIFACT_DIR / "reference-manifest.json"

V004_BLEND_PATH = PROJECT_ROOT / "assets/lenox/lenox-v004.blend"
V004_GLB_PATH = PROJECT_ROOT / "public/models/lenox/lenox-v004.glb"
V004_BLEND_SHA256 = "6f6df45a268066b58bbd118643c711696dac5c771d45e291c9c9a1abb0077aa6"
V004_GLB_SHA256 = "0427e499cc9b38c85bb6e55a9ccf6251fc2034e118b88539beb2cca851289e60"

HELPER_PATH = Path(__file__).with_name("generate_lenox_v002.py")
SPEC = importlib.util.spec_from_file_location("lenox_frozen_helpers", HELPER_PATH)
if SPEC is None or SPEC.loader is None:
    raise RuntimeError(f"Could not load Blender helpers from {HELPER_PATH}")
helpers = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(helpers)


ARM_SPECS = (
    ("Lead_L", "lead", [(-0.38, -0.18, 1.75), (-0.68, -0.72, 1.30), (-1.00, -1.08, 0.72),
                         (-1.08, -1.22, 0.20), (-0.88, -1.30, -0.02), (-0.52, -1.33, 0.05),
                         (-0.32, -1.34, 0.34), (-0.45, -1.35, 0.58)],
     [1.52, 1.40, 1.18, 0.86, 0.58, 0.37, 0.21, 0.11], 0.39),
    ("Lead_R", "lead", [(0.34, -0.20, 1.75), (0.60, -0.74, 1.32), (0.87, -1.10, 0.76),
                         (0.91, -1.25, 0.23), (0.70, -1.34, 0.00), (0.37, -1.37, 0.10),
                         (0.20, -1.37, 0.39), (0.35, -1.38, 0.61)],
     [1.54, 1.42, 1.17, 0.84, 0.56, 0.36, 0.20, 0.11], 0.39),
    ("Support_Front_L", "support", [(-0.78, -0.02, 1.63), (-1.20, -0.43, 1.21),
                                     (-1.58, -0.77, 0.70), (-1.75, -0.95, 0.28),
                                     (-1.64, -1.08, 0.03), (-1.35, -1.14, 0.07),
                                     (-1.15, -1.16, 0.29), (-1.28, -1.17, 0.47)],
     [1.35, 1.23, 1.01, 0.74, 0.50, 0.31, 0.18, 0.10], 0.34),
    ("Support_Front_R", "support", [(0.80, 0.01, 1.62), (1.22, -0.38, 1.21),
                                     (1.66, -0.66, 0.75), (1.91, -0.82, 0.36),
                                     (1.88, -0.99, 0.10), (1.61, -1.08, 0.08),
                                     (1.40, -1.11, 0.31), (1.53, -1.11, 0.50)],
     [1.33, 1.21, 1.00, 0.73, 0.48, 0.30, 0.17, 0.10], 0.33),
    ("Support_Side_L", "support", [(-1.08, 0.26, 1.55), (-1.65, 0.06, 1.20),
                                    (-2.20, -0.22, 0.82), (-2.58, -0.46, 0.49),
                                    (-2.70, -0.63, 0.29), (-2.65, -0.72, 0.70),
                                    (-2.45, -0.74, 1.19), (-2.18, -0.74, 1.46),
                                    (-1.98, -0.74, 1.24)],
     [1.31, 1.20, 1.02, 0.78, 0.56, 0.38, 0.24, 0.14, 0.09], 0.35),
    ("Support_Side_R", "support", [(1.06, 0.28, 1.54), (1.59, 0.13, 1.22),
                                    (2.16, -0.08, 0.88), (2.57, -0.27, 0.59),
                                    (2.75, -0.43, 0.38), (2.73, -0.53, 0.78),
                                    (2.56, -0.59, 1.25), (2.30, -0.61, 1.52),
                                    (2.08, -0.63, 1.31)],
     [1.32, 1.21, 1.03, 0.79, 0.57, 0.39, 0.24, 0.14, 0.09], 0.35),
    ("Secondary_Rear_L", "secondary", [(-0.68, 0.60, 1.46), (-1.18, 0.64, 1.13),
                                        (-1.70, 0.53, 0.84), (-2.07, 0.37, 0.64),
                                        (-2.24, 0.18, 0.80), (-2.21, 0.02, 1.12),
                                        (-2.03, -0.05, 1.30), (-1.88, -0.08, 1.16)],
     [1.20, 1.10, 0.92, 0.70, 0.50, 0.34, 0.20, 0.11], 0.34),
    ("Secondary_Rear_R", "secondary", [(0.65, 0.62, 1.47), (1.14, 0.70, 1.15),
                                        (1.67, 0.64, 0.89), (2.05, 0.50, 0.72),
                                        (2.22, 0.31, 0.90), (2.18, 0.14, 1.20),
                                        (2.00, 0.04, 1.35), (1.84, 0.00, 1.20)],
     [1.21, 1.11, 0.92, 0.70, 0.50, 0.34, 0.20, 0.11], 0.34),
)

BODY_PROFILE = (
    (0.16, 0.30, 0.25, 0.18), (0.36, 0.78, 0.62, 0.18),
    (0.68, 1.18, 0.90, 0.17), (1.05, 1.42, 1.08, 0.15),
    (1.45, 1.52, 1.18, 0.13), (1.86, 1.54, 1.22, 0.11),
    (2.22, 1.48, 1.22, 0.09), (2.50, 1.50, 1.27, 0.07),
    (2.76, 1.78, 1.42, 0.05), (3.08, 2.04, 1.54, 0.04),
    (3.46, 2.13, 1.60, 0.03), (3.86, 2.13, 1.60, 0.03),
    (4.24, 2.04, 1.52, 0.04), (4.62, 1.72, 1.27, 0.06),
    (4.94, 1.30, 0.93, 0.09), (5.18, 0.72, 0.54, 0.12),
    (5.30, 0.26, 0.23, 0.14),
)


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def configure_output_paths() -> None:
    global BLEND_PATH, ARTIFACT_DIR, REPORT_PATH, MANIFEST_PATH
    arguments = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    if "--output-root" not in arguments:
        return
    index = arguments.index("--output-root")
    if index + 1 >= len(arguments):
        raise RuntimeError("--output-root requires an absolute path")
    output_root = Path(arguments[index + 1]).resolve()
    if not output_root.is_absolute():
        raise RuntimeError("--output-root must be absolute")
    BLEND_PATH = output_root / "assets/lenox/lenox-v005-clay.blend"
    ARTIFACT_DIR = output_root / "artifacts/lenox-blender/v005/static-form"
    REPORT_PATH = ARTIFACT_DIR / "static-form-report.json"
    MANIFEST_PATH = ARTIFACT_DIR / "reference-manifest.json"


def path_label(path: Path) -> str:
    try:
        return str(path.relative_to(PROJECT_ROOT))
    except ValueError:
        return str(path)


def validate_inputs() -> None:
    for path, expected in ((V004_BLEND_PATH, V004_BLEND_SHA256), (V004_GLB_PATH, V004_GLB_SHA256)):
        if sha256(path) != expected:
            raise RuntimeError(f"Frozen v004 anchor changed: {path}")
    if not REFERENCE_PATH.exists():
        raise RuntimeError(f"Canonical reference missing: {REFERENCE_PATH}")


def clear_owned_factory_scene() -> None:
    if not bpy.app.background:
        raise RuntimeError("Static-form generator is restricted to a background factory-startup process")
    helpers.clear_scene()


def interpolate_profile(z: float) -> tuple[float, float, float]:
    for index in range(len(BODY_PROFILE) - 1):
        left, right = BODY_PROFILE[index], BODY_PROFILE[index + 1]
        if left[0] <= z <= right[0]:
            t = (z - left[0]) / (right[0] - left[0])
            smooth = t * t * (3.0 - 2.0 * t)
            return tuple(left[i] + (right[i] - left[i]) * smooth for i in range(1, 4))
    return BODY_PROFILE[-1][1:]


def build_head_body(name: str, rings: int, segments: int, material: bpy.types.Material,
                    collection: bpy.types.Collection) -> bpy.types.Object:
    vertices = []
    faces = []
    z_min, z_max = BODY_PROFILE[0][0], BODY_PROFILE[-1][0]
    for ring in range(rings):
        v = ring / (rings - 1)
        z = z_min + (z_max - z_min) * v
        rx, ry, center_y = interpolate_profile(z)
        for segment in range(segments):
            angle = segment / segments * math.tau
            x = math.cos(angle) * rx
            y = center_y + math.sin(angle) * ry
            if y < center_y:
                eye_socket = sum(math.exp(-(((x - side * 0.62) / 0.62) ** 2 + ((z - 3.55) / 0.70) ** 2) * 2.0)
                                 for side in (-1.0, 1.0))
                cheek = sum(math.exp(-(((x - side * 0.88) / 0.78) ** 2 + ((z - 3.05) / 0.52) ** 2) * 2.2)
                            for side in (-1.0, 1.0))
                brow = sum(math.exp(-(((x - side * 0.68) / 0.72) ** 2 + ((z - 4.28) / 0.30) ** 2) * 2.4)
                           for side in (-1.0, 1.0))
                muzzle = math.exp(-((x / 0.62) ** 2 + ((z - 2.78) / 0.42) ** 2) * 2.0)
                y += 0.105 * eye_socket - 0.075 * cheek - 0.035 * brow - 0.045 * muzzle
            vertices.append((x, y, z))
    for ring in range(rings - 1):
        for segment in range(segments):
            nxt = (segment + 1) % segments
            a = ring * segments + segment
            b = ring * segments + nxt
            c = (ring + 1) * segments + nxt
            d = (ring + 1) * segments + segment
            faces.append((a, b, c, d))
    faces.append(tuple(reversed(range(segments))))
    top = (rings - 1) * segments
    faces.append(tuple(top + index for index in range(segments)))
    mesh = bpy.data.meshes.new(f"{name}_Mesh")
    mesh.from_pydata(vertices, [], faces)
    mesh.materials.append(material)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    collection.objects.link(obj)
    for polygon in mesh.polygons:
        polygon.use_smooth = True
    obj["sculpt_formwork"] = "authored cheeks, eye sockets, brow plane, muzzle, head-body flow"
    obj["not_subdivision_only"] = True
    return obj


def apply_modifier(obj: bpy.types.Object, modifier: bpy.types.Modifier) -> None:
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.modifier_apply(modifier=modifier.name)


def build_fin(label: str, side: float, material: bpy.types.Material, rib_material: bpy.types.Material,
              collection: bpy.types.Collection) -> bpy.types.Object:
    rows, columns = 8, 7
    outline = ((2.03, 4.45), (2.34, 4.41), (2.60, 4.26), (2.76, 4.02),
               (2.79, 3.73), (2.68, 3.48), (2.43, 3.29), (2.08, 3.19))
    vertices = []
    faces = []
    for row in range(rows):
        v = row / (rows - 1)
        root_z = 4.42 + (3.22 - 4.42) * v
        outer_x, outer_z = outline[row]
        for column in range(columns):
            u = column / (columns - 1)
            ease = u * u * (3.0 - 2.0 * u)
            fan = math.sin(u * math.pi) * math.sin(v * math.pi)
            vertices.append(((1.70 + (outer_x - 1.70) * ease) * side,
                             -0.26 - 0.58 * ease - 0.13 * fan,
                             root_z + (outer_z - root_z) * ease + 0.025 * fan))
    for row in range(rows - 1):
        for column in range(columns - 1):
            a = row * columns + column
            faces.append((a, a + 1, a + columns + 1, a + columns))
    mesh = bpy.data.meshes.new(f"LENOX_v005_Clay_Fin_{label}_Mesh")
    mesh.from_pydata(vertices, [], faces)
    mesh.materials.append(material)
    mesh.update()
    obj = bpy.data.objects.new(f"LENOX_v005_Clay_Fin_{label}", mesh)
    collection.objects.link(obj)
    solidify = obj.modifiers.new("Broad organic root", "SOLIDIFY")
    solidify.thickness = 0.075
    bevel = obj.modifiers.new("Rounded fan edge", "BEVEL")
    bevel.width = 0.055
    bevel.segments = 3
    subdivision = obj.modifiers.new("Sculpted membrane", "SUBSURF")
    subdivision.levels = 2
    subdivision.render_levels = 2
    for modifier in (solidify, bevel, subdivision):
        apply_modifier(obj, modifier)
    for polygon in obj.data.polygons:
        polygon.use_smooth = True
    ribs = []
    for row in range(1, rows - 1):
        v = row / (rows - 1)
        root_z = 4.42 + (3.22 - 4.42) * v
        outer_x, outer_z = outline[row]
        ribs.append(helpers.add_poly_curve(
            f"LENOX_v005_Clay_FinRib_{label}_{row}",
            [(1.73 * side, -0.76, root_z),
             (((1.73 + outer_x) * 0.5) * side, -0.91, (root_z + outer_z) * 0.5),
             ((outer_x - 0.09) * side, -1.01, outer_z)],
            0.020, rib_material, collection,
        ))
    obj["form_intent"] = "compact ribbed fan, broad head root, camera-forward sweep"
    return obj


def build_character() -> dict:
    visible = helpers.get_collection("LENOX_v005_STATIC_FORM")
    cage_collection = helpers.get_collection("LENOX_v005_FUTURE_RETOPO_CAGE")
    clay = helpers.material("LENOX_v005_Clay", (0.30, 0.47, 0.39, 1.0), 0.48)
    eye_white = helpers.material("LENOX_v005_EyeSocketProxy", (0.58, 0.61, 0.54, 1.0), 0.25)
    eye_iris = helpers.material("LENOX_v005_IrisProxy", (0.07, 0.28, 0.22, 1.0), 0.20)
    clay_dark = helpers.material("LENOX_v005_PupilProxy", (0.012, 0.020, 0.018, 1.0), 0.18)
    glint_proxy = helpers.material("LENOX_v005_GlintProxy", (0.85, 0.88, 0.78, 1.0), 0.12)
    crease = helpers.material("LENOX_v005_CreaseProxy", (0.20, 0.25, 0.23, 1.0), 0.55)

    body = build_head_body("SCULPT_v005_StaticForm_High", 54, 72, clay, visible)
    body_subdivision = body.modifiers.new("High-res sculpt surface", "SUBSURF")
    body_subdivision.levels = 1
    body_subdivision.render_levels = 1
    apply_modifier(body, body_subdivision)
    cage = build_head_body("CAGE_v005_FutureRetopo", 22, 32, clay, cage_collection)
    cage.hide_render = True
    cage.hide_viewport = True

    fins = [build_fin(label, side, clay, crease, visible) for label, side in (("L", -1.0), ("R", 1.0))]
    arms = []
    for name, role, points, radii, depth in ARM_SPECS:
        arm = helpers.add_curve_mesh(f"LENOX_v005_Clay_Arm_{name}", points, radii, depth, clay, visible,
                                     bevel_resolution=6 if role == "lead" else 5, resolution=8)
        arm["visible_role"] = role
        arms.append(arm)

    eyes = []
    for label, side in (("L", -1.0), ("R", 1.0)):
        sclera = helpers.add_uv_sphere(f"LENOX_v005_Clay_EyeSocket_{label}", (0.62 * side, -1.43, 3.55),
                                      (0.64, 0.27, 0.72), eye_white, visible, segments=36, rings=24)
        iris = helpers.add_uv_sphere(f"LENOX_v005_Clay_IrisProxy_{label}", (0.62 * side, -1.686, 3.55),
                                    (0.46, 0.052, 0.52), eye_iris, visible, segments=32, rings=20)
        pupil = helpers.add_uv_sphere(f"LENOX_v005_Clay_PupilProxy_{label}", (0.62 * side, -1.730, 3.55),
                                     (0.29, 0.030, 0.34), clay_dark, visible, segments=28, rings=18)
        glint = helpers.add_uv_sphere(f"LENOX_v005_Clay_GlintProxy_{label}",
                                     ((0.52 if side < 0 else 0.72) * side, -1.756, 3.77),
                                     (0.075, 0.018, 0.090), glint_proxy, visible, segments=14, rings=8)
        eyes.extend((sclera, iris, pupil, glint))

    brows = [helpers.add_uv_sphere(
        f"LENOX_v005_Clay_BrowRidge_{label}", (0.73 * side, -1.545, 4.17),
        (0.44, 0.030, 0.065), clay, visible, segments=28, rings=12,
    ) for label, side in (("L", -1.0), ("R", 1.0))]
    mouth = helpers.add_poly_curve("LENOX_v005_Clay_ClosedMouth",
                                   [(-0.25, -1.50, 2.72), (-0.11, -1.55, 2.68),
                                    (0.0, -1.56, 2.68), (0.11, -1.55, 2.68), (0.25, -1.50, 2.72)],
                                   0.018, crease, visible)
    nose = helpers.add_uv_sphere("LENOX_v005_Clay_Nose", (0.0, -1.52, 2.96),
                                (0.055, 0.025, 0.035), clay, visible, segments=16, rings=10)

    crown = []
    crown_positions = ((0.0, -0.42, 5.18, 0.08), (-0.24, -0.58, 5.10, 0.07),
                       (0.24, -0.58, 5.10, 0.07), (-0.50, -0.78, 4.98, 0.065),
                       (0.50, -0.78, 4.98, 0.065), (-0.78, -0.98, 4.81, 0.055),
                       (0.78, -0.98, 4.81, 0.055), (-1.02, -1.14, 4.59, 0.045),
                       (1.02, -1.14, 4.59, 0.045), (-0.16, -1.20, 4.83, 0.050),
                       (0.16, -1.20, 4.83, 0.050))
    for index, (x, y, z, radius) in enumerate(crown_positions, 1):
        crown.append(helpers.add_uv_sphere(f"LENOX_v005_Clay_Crown_{index:02d}", (x, y, z),
                                          (radius, radius * 0.58, radius * 1.20), clay, visible,
                                          segments=14, rings=8))
    return {"body": body, "cage": cage, "fins": fins, "arms": arms, "eyes": eyes,
            "brows": brows, "mouth": mouth, "nose": nose, "crown": crown,
            "visible": visible, "cage_collection": cage_collection}


def aim_at(obj: bpy.types.Object, target: tuple[float, float, float]) -> None:
    obj.rotation_euler = (Vector(target) - obj.location).to_track_quat("-Z", "Y").to_euler()


def build_studio() -> dict:
    studio = helpers.get_collection("LENOX_v005_STATIC_STUDIO")
    background = helpers.material("LENOX_v005_InspectionNeutral", (0.42, 0.46, 0.43, 1.0), 0.60)
    bpy.ops.mesh.primitive_plane_add(size=22.0, location=(0.0, 0.6, -0.10))
    ground = bpy.context.object
    ground.data.materials.append(background)
    helpers.move_to_collection(ground, studio)
    lights = []
    for name, location, energy, size, color in (
        ("Key", (-4.5, -5.5, 7.5), 720.0, 5.0, (1.0, 0.92, 0.82)),
        ("Fill", (4.8, -4.0, 5.6), 470.0, 4.2, (0.70, 0.92, 0.86)),
        ("Rim", (0.0, 3.5, 6.7), 600.0, 3.8, (0.88, 0.96, 1.0)),
    ):
        bpy.ops.object.light_add(type="AREA", location=location)
        light = bpy.context.object
        light.name = f"STUDIO_{name}"
        light.data.energy = energy
        light.data.size = size
        light.data.color = color
        aim_at(light, (0.0, 0.0, 2.6))
        helpers.move_to_collection(light, studio)
        lights.append(light)
    bpy.ops.object.camera_add(location=(0.0, -12.5, 3.05))
    front = bpy.context.object
    front.name = "STUDIO_Camera_Front"
    front.data.type = "ORTHO"
    front.data.ortho_scale = 6.10
    aim_at(front, (0.0, 0.0, 2.55))
    helpers.move_to_collection(front, studio)
    bpy.ops.object.camera_add(location=(7.4, -11.5, 4.3))
    three_quarter = bpy.context.object
    three_quarter.name = "STUDIO_Camera_ThreeQuarter"
    three_quarter.data.type = "ORTHO"
    three_quarter.data.ortho_scale = 6.25
    aim_at(three_quarter, (0.0, 0.0, 2.48))
    helpers.move_to_collection(three_quarter, studio)
    world = bpy.context.scene.world
    world.use_nodes = True
    world.node_tree.nodes["Background"].inputs["Color"].default_value = (0.42, 0.46, 0.43, 1.0)
    world.node_tree.nodes["Background"].inputs["Strength"].default_value = 0.42
    return {"front": front, "three_quarter": three_quarter, "lights": lights, "ground": ground}


def configure_render() -> None:
    scene = bpy.context.scene
    scene.render.engine = "CYCLES"
    scene.cycles.device = "CPU"
    scene.cycles.samples = 16
    scene.cycles.use_denoising = True
    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_mode = "RGBA"
    scene.render.resolution_percentage = 100
    scene.render.film_transparent = False
    scene.view_settings.view_transform = "Standard"
    scene.view_settings.look = "Medium High Contrast"
    scene.view_settings.exposure = 0.0
    scene.view_settings.gamma = 1.0


def render(camera: bpy.types.Object, path: Path, size: int) -> None:
    scene = bpy.context.scene
    scene.camera = camera
    scene.render.resolution_x = size
    scene.render.resolution_y = size
    scene.render.filepath = str(path)
    bpy.ops.render.render(write_still=True)


def make_reference_overlay(front_path: Path, output_path: Path, size: int = 1024) -> None:
    reference = bpy.data.images.load(str(REFERENCE_PATH), check_existing=False)
    front = bpy.data.images.load(str(front_path), check_existing=False)
    reference.scale(size, size)
    front.scale(size, size)
    reference_pixels = list(reference.pixels[:])
    front_pixels = list(front.pixels[:])
    pixels = array("f", [0.0]) * (size * size * 4)
    for index in range(0, len(pixels), 4):
        pixels[index] = reference_pixels[index] * 0.52 + front_pixels[index] * 0.48
        pixels[index + 1] = reference_pixels[index + 1] * 0.52 + front_pixels[index + 1] * 0.48
        pixels[index + 2] = reference_pixels[index + 2] * 0.52 + front_pixels[index + 2] * 0.48
        pixels[index + 3] = 1.0
    overlay = bpy.data.images.new("LENOX_v005_ReferenceOverlay", width=size, height=size, alpha=True)
    overlay.pixels.foreach_set(pixels)
    overlay.update()
    overlay.filepath_raw = str(output_path)
    overlay.file_format = "PNG"
    overlay.save()


def mesh_counts(character: dict) -> dict:
    objects = [obj for obj in character["visible"].objects if obj.type == "MESH"]
    return {
        "visible_meshes": len(objects),
        "visible_vertices": sum(len(obj.data.vertices) for obj in objects),
        "visible_triangles": sum(sum(max(0, len(poly.vertices) - 2) for poly in obj.data.polygons) for obj in objects),
        "visible_arms": len(character["arms"]),
    }


def write_manifest() -> None:
    manifest = {
        "version": "v005-static-form-gate",
        "authority": str(REFERENCE_PATH.relative_to(PROJECT_ROOT)),
        "reference_sha256": sha256(REFERENCE_PATH),
        "bound_to_reference": [
            "front silhouette", "front head/body ratio", "visible eye position and spacing",
            "visible fin width and attachment", "visible eight-arm distribution",
        ],
        "controlled_interpretation": [
            "side and rear head volume", "back anatomy", "fin rear surfaces",
            "spatial depth and rear-arm staging", "all forms not visible in the single canonical front view",
        ],
        "measurement_contract": "Landmarks, ratios and overlays are diagnostic only and never grant visual approval.",
        "gate_contract": "One human static-form decision before retopo, rig, morphs, materials or runtime work.",
    }
    MANIFEST_PATH.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")


def write_report(character: dict, renders: dict[str, Path]) -> None:
    binary_path = Path(bpy.app.binary_path).resolve()
    report = {
        "stage": "v005 static-form gate only",
        "promotion": "blocked pending Volkan static-form decision",
        "v004_anchor": {
            "blend_sha256": sha256(V004_BLEND_PATH),
            "glb_sha256": sha256(V004_GLB_PATH),
        },
        "toolchain": {
            "binary": str(binary_path),
            "binary_sha256": sha256(binary_path),
            "blender": bpy.app.version_string,
            "python": platform.python_version(),
            "generator_sha256": sha256(Path(__file__).resolve()),
            "reference_sha256": sha256(REFERENCE_PATH),
            "command": f"{binary_path} --background --factory-startup --gpu-backend opengl --python {Path(__file__).resolve()}",
            "status": "documented reference environment; canonical reproducibility requires isolated double rebuild",
        },
        "scene": mesh_counts(character),
        "forms": {
            "head_body": "single authored continuous surface with cheeks, eye sockets, brow plane, muzzle and organic body transition",
            "fins": "compact ribbed fans with broad roots and camera-forward sweep",
            "arms": "eight visible asymmetric arms; two lead, four support, two secondary rear",
            "future_retopology": "hidden deterministic cage is provisional and must not be finalized before gate",
        },
        "excluded_until_gate": ["final retopology", "rig", "weights", "morph targets", "textures", "animation", "GLB", "runtime"],
        "renders": {name: {"path": path_label(path), "sha256": sha256(path)} for name, path in renders.items()},
        "blend": {"path": path_label(BLEND_PATH), "sha256": sha256(BLEND_PATH)},
    }
    REPORT_PATH.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")


def main() -> None:
    configure_output_paths()
    validate_inputs()
    ARTIFACT_DIR.mkdir(parents=True, exist_ok=True)
    BLEND_PATH.parent.mkdir(parents=True, exist_ok=True)
    clear_owned_factory_scene()
    character = build_character()
    studio = build_studio()
    configure_render()
    bpy.ops.wm.save_as_mainfile(filepath=str(BLEND_PATH))
    renders = {
        "front": ARTIFACT_DIR / "clay-front-neutral.png",
        "three_quarter": ARTIFACT_DIR / "clay-three-quarter.png",
        "silhouette_96": ARTIFACT_DIR / "clay-silhouette-96px.png",
        "silhouette_64": ARTIFACT_DIR / "clay-silhouette-64px.png",
    }
    render(studio["front"], renders["front"], 1024)
    render(studio["three_quarter"], renders["three_quarter"], 1024)
    render(studio["front"], renders["silhouette_96"], 96)
    render(studio["front"], renders["silhouette_64"], 64)
    overlay_path = ARTIFACT_DIR / "clay-reference-overlay.png"
    make_reference_overlay(renders["front"], overlay_path)
    renders["reference_overlay"] = overlay_path
    write_manifest()
    write_report(character, renders)
    print(json.dumps({"status": "STATIC_FORM_GATE_READY", "report": str(REPORT_PATH)}, indent=2))


if __name__ == "__main__":
    main()
