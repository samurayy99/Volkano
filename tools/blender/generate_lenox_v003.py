"""Generate the focused LENOX v003 head and silhouette pass.

This is deliberately a delta over v002. Body, mouth, arms, suckers, rig mapping,
materials, animation logic and web budgets are inherited without redesign.

Validated with Blender 3.6.23:
  blender --background --gpu-backend opengl --python tools/blender/generate_lenox_v003.py
"""

from __future__ import annotations

import importlib.util
import json
from pathlib import Path

import bpy


MODULE_PATH = Path(__file__).with_name("generate_lenox_v002.py")
SPEC = importlib.util.spec_from_file_location("lenox_v002", MODULE_PATH)
if SPEC is None or SPEC.loader is None:
    raise RuntimeError(f"Could not load v002 generator from {MODULE_PATH}")
base = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(base)

PROJECT_ROOT = Path(__file__).resolve().parents[2]
base.BLEND_PATH = PROJECT_ROOT / "assets/lenox/lenox-v003.blend"
base.GLB_PATH = PROJECT_ROOT / "public/models/lenox/lenox-v003.glb"
base.ARTIFACT_DIR = PROJECT_ROOT / "artifacts/lenox-blender/v003"
base.REPORT_PATH = base.ARTIFACT_DIR / "lenox-v003-report.json"

add_expression_curve_v002 = base.add_expression_curve
create_character_v002 = base.create_character
report_v002 = base.report


def add_fin_v003(
    label: str,
    side: float,
    skin: bpy.types.Material,
    opal: bpy.types.Material,
    target: bpy.types.Collection,
) -> bpy.types.Object:
    """Broad-rooted rounded membrane with joined, low organic ribs."""
    x = side
    vertices = [
        (1.45 * x, -0.16, 4.10),
        (1.84 * x, -0.54, 4.18),
        (2.34 * x, -0.86, 4.07),
        (2.51 * x, -1.02, 3.91),
        (2.55 * x, -1.10, 3.72),
        (2.50 * x, -1.04, 3.54),
        (2.34 * x, -0.92, 3.40),
        (1.84 * x, -0.56, 3.30),
        (1.46 * x, -0.18, 3.36),
        (1.78 * x, -0.63, 3.74),
    ]
    faces = [
        (0, 1, 9),
        (1, 2, 9),
        (2, 3, 9),
        (3, 4, 9),
        (4, 5, 9),
        (5, 6, 9),
        (6, 7, 9),
        (7, 8, 9),
        (8, 0, 9),
    ]
    mesh = bpy.data.meshes.new(f"LENOX_Fin_{label}_Mesh")
    mesh.from_pydata(vertices, [], faces)
    mesh.update()
    membrane = bpy.data.objects.new(f"LENOX_Fin_{label}", mesh)
    mesh.materials.append(skin)
    target.objects.link(membrane)

    solidify = membrane.modifiers.new("Membrane thickness", "SOLIDIFY")
    solidify.thickness = 0.07
    bevel = membrane.modifiers.new("Rounded perimeter", "BEVEL")
    bevel.width = 0.08
    bevel.segments = 3
    subdivision = membrane.modifiers.new("Soft membrane", "SUBSURF")
    subdivision.levels = 2
    subdivision.render_levels = 2
    bpy.context.view_layer.objects.active = membrane
    membrane.select_set(True)
    bpy.ops.object.modifier_apply(modifier=solidify.name)
    bpy.ops.object.modifier_apply(modifier=bevel.name)
    bpy.ops.object.modifier_apply(modifier=subdivision.name)

    rib_paths = (
        [(1.51 * x, -0.24, 4.02), (1.88 * x, -0.62, 4.02), (2.30 * x, -0.91, 4.00)],
        [(1.50 * x, -0.24, 3.76), (1.96 * x, -0.72, 3.77), (2.48 * x, -1.06, 3.74)],
        [(1.51 * x, -0.24, 3.49), (1.88 * x, -0.63, 3.50), (2.30 * x, -0.94, 3.49)],
    )
    ribs = [
        base.add_poly_curve(
            f"LENOX_FinRib_{label}_{index}",
            points,
            0.027,
            skin,
            target,
        )
        for index, points in enumerate(rib_paths, start=1)
    ]
    bpy.ops.object.select_all(action="DESELECT")
    membrane.select_set(True)
    for rib in ribs:
        rib.select_set(True)
    bpy.context.view_layer.objects.active = membrane
    bpy.ops.object.join()
    membrane.name = f"LENOX_Fin_{label}"
    for polygon in membrane.data.polygons:
        polygon.use_smooth = True

    basis = membrane.shape_key_add(name="Basis")
    concerned = membrane.shape_key_add(name="Concerned")
    confirm = membrane.shape_key_add(name="Confirm")
    thinking = membrane.shape_key_add(name="Thinking")
    for index, vertex in enumerate(basis.data):
        local_x = abs(vertex.co.x)
        influence = max(0.0, min(1.0, (local_x - 1.45) / 1.15))
        concerned.data[index].co.z -= 0.28 * influence
        concerned.data[index].co.y += 0.16 * influence
        confirm.data[index].co.z += 0.20 * influence
        confirm.data[index].co.y -= 0.12 * influence
        thinking.data[index].co.y += 0.06 * influence
    membrane["form_note"] = "rounded broad-root forward-swept ribbed membrane"
    return membrane


def add_expression_curve_v003(
    name: str,
    points: list[tuple[float, float, float]],
    depth: float,
    mat: bpy.types.Material,
    target: bpy.types.Collection,
    channel: str,
) -> bpy.types.Object:
    side = -1.0 if name.endswith("_L") else 1.0
    if name.startswith("LENOX_Brow_"):
        points = [
            (1.18 * side, -1.25, 4.21),
            (0.77 * side, -1.29, 4.29),
            (0.28 * side, -1.25, 4.22),
        ]
        depth = 0.024
        mat = bpy.data.materials["LENOX_PearlOpal_Light"]
    elif name.startswith("LENOX_UpperLid_"):
        points = [
            (1.25 * side, -1.43, 3.91),
            (0.65 * side, -1.52, 4.15),
            (0.08 * side, -1.42, 3.91),
        ]
        depth = 0.047
    return add_expression_curve_v002(name, points, depth, mat, target, channel)


base.add_fin = add_fin_v003
base.add_expression_curve = add_expression_curve_v003


def reshape_head(mesh_object: bpy.types.Object) -> None:
    for vertex in mesh_object.data.vertices:
        vertex.co.x *= 0.92
        vertex.co.y *= 0.99
        vertex.co.z *= 1.08
    if mesh_object.parent:
        world = mesh_object.matrix_world.copy()
        world.translation.z += 0.06
        mesh_object.matrix_world = world
    else:
        mesh_object.location.z += 0.06
    mesh_object.data.update()


def move_eye_bones(rig: bpy.types.Object) -> None:
    bpy.context.view_layer.objects.active = rig
    rig.select_set(True)
    bpy.ops.object.mode_set(mode="EDIT")
    for label, side in (("L", -1.0), ("R", 1.0)):
        bone = rig.data.edit_bones[f"Eye.{label}"]
        delta_x = -0.10 * side
        for endpoint in (bone.head, bone.tail):
            endpoint.x += delta_x
            endpoint.y += 0.08
            endpoint.z += 0.13
    bpy.ops.object.mode_set(mode="OBJECT")


def rebuild_crown(rig: bpy.types.Object, opal: bpy.types.Material) -> None:
    for obj in tuple(bpy.data.objects):
        if obj.name.startswith("LENOX_CrownPearl_"):
            bpy.data.objects.remove(obj, do_unlink=True)
    positions = (
        (0.00, -1.28, 4.99, 0.090, 0.130),
        (-0.18, -1.31, 4.90, 0.075, 0.110), (0.18, -1.31, 4.90, 0.075, 0.110),
        (-0.37, -1.32, 4.80, 0.070, 0.100), (0.37, -1.32, 4.80, 0.070, 0.100),
        (-0.56, -1.30, 4.66, 0.062, 0.090), (0.56, -1.30, 4.66, 0.062, 0.090),
        (-0.75, -1.24, 4.49, 0.052, 0.076), (0.75, -1.24, 4.49, 0.052, 0.076),
        (-0.12, -1.36, 4.65, 0.052, 0.074), (0.12, -1.36, 4.65, 0.052, 0.074),
    )
    export = bpy.data.collections[base.EXPORT_COLLECTION]
    for index, (x, y, z, sx, sz) in enumerate(positions, start=1):
        pearl = base.add_uv_sphere(
            f"LENOX_CrownPearl_{index:02d}",
            (x, y, z),
            (sx, 0.040, sz),
            opal,
            export,
            segments=14,
            rings=8,
        )
        base.parent_to_bone(pearl, rig, "Head")


def create_character_v003() -> dict:
    character = create_character_v002()
    character["root"]["version"] = "v003"
    reshape_head(character["head"])
    reshape_head(bpy.data.objects["SCULPT_Head_High"])
    move_eye_bones(character["rig"])
    rebuild_crown(character["rig"], character["materials"][2])
    character["head"]["form_note"] = "higher rounder narrower baby-cephalopod dome"
    return character


def render_self_checks_v003(character: dict, studio: dict) -> None:
    for size in (64, 96):
        base.render(base.ARTIFACT_DIR / f"silhouette-v003-{size}px.png", size, frame=1)
    base.render(base.ARTIFACT_DIR / "inspection-front-neutral.png", 1024, frame=1)
    camera = studio["camera"]
    original_location = camera.location.copy()
    original_rotation = camera.rotation_euler.copy()
    camera.location = (7.4, -11.8, 3.4)
    base.aim_at(camera, (0.0, 0.0, 2.55))
    base.render(base.ARTIFACT_DIR / "inspection-three-quarter.png", 1024, frame=36)
    camera.location = original_location
    camera.rotation_euler = original_rotation


def report_v003(character: dict) -> dict:
    result = report_v002(character)
    result["version"] = "v003"
    result["silhouette_self_checks"] = [
        "silhouette-v003-64px.png",
        "silhouette-v003-96px.png",
    ]
    result.pop("technical_form_checks", None)
    result["focused_delta"] = [
        "fin_ears",
        "head_dome",
        "eye_placement",
        "integrated_brow_ridges",
        "pearl_crown_distribution",
    ]
    base.REPORT_PATH.write_text(json.dumps(result, indent=2) + "\n", encoding="utf-8")
    return result


base.create_character = create_character_v003
base.render_self_checks = render_self_checks_v003
base.report = report_v003


def main() -> None:
    base.progress("start")
    base.ensure_dirs()
    base.clear_scene()
    base.progress("scene_cleared")
    character = create_character_v003()
    base.progress("character_complete")
    studio = base.create_studio()
    base.configure_render()
    base.progress("studio_complete")
    base.create_animation(character)
    if character["rig"].animation_data and character["rig"].animation_data.action:
        character["rig"].animation_data.action.name = "LENOX_v003_MotionExpression_Test"
    base.progress("animation_complete")
    render_self_checks_v003(character, studio)
    base.progress("renders_complete")
    bpy.ops.wm.save_as_mainfile(filepath=str(base.BLEND_PATH))
    base.progress("blend_saved")
    base.export_glb(character)
    base.progress("glb_exported")
    result = report_v003(character)
    bpy.ops.wm.save_as_mainfile(filepath=str(base.BLEND_PATH))
    print("LENOX_V003_RESULT=" + json.dumps(result, sort_keys=True))
    if not result["budget"]["glb_pass"] or not result["budget"]["triangles_pass"]:
        raise RuntimeError("LENOX v003 exceeded the hard web budget")


if __name__ == "__main__":
    main()
