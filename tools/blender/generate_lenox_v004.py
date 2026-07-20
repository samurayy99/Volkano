"""Generate the final frozen LENOX v004 head pass.

Only neutral brow geometry, fin-ear proportions and sclera-ring depth differ
from v003. Every other model, rig, material and animation function is inherited.

Validated with Blender 3.6.23:
  blender --background --gpu-backend opengl --python tools/blender/generate_lenox_v004.py
"""

from __future__ import annotations

import importlib.util
import json
from pathlib import Path

import bpy


MODULE_PATH = Path(__file__).with_name("generate_lenox_v003.py")
SPEC = importlib.util.spec_from_file_location("lenox_v003", MODULE_PATH)
if SPEC is None or SPEC.loader is None:
    raise RuntimeError(f"Could not load v003 generator from {MODULE_PATH}")
v003 = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(v003)
base = v003.base

PROJECT_ROOT = Path(__file__).resolve().parents[2]
base.BLEND_PATH = PROJECT_ROOT / "assets/lenox/lenox-v004.blend"
base.GLB_PATH = PROJECT_ROOT / "public/models/lenox/lenox-v004.glb"
base.ARTIFACT_DIR = PROJECT_ROOT / "artifacts/lenox-blender/v004"
base.REPORT_PATH = base.ARTIFACT_DIR / "lenox-v004-report.json"

add_expression_curve_v003 = v003.add_expression_curve_v003


def add_fin_v004(
    label: str,
    side: float,
    skin: bpy.types.Material,
    opal: bpy.types.Material,
    target: bpy.types.Collection,
) -> bpy.types.Object:
    """Compact rounded fan with a wide root and shallow forward sweep."""
    x = side
    vertices = [
        (1.44 * x, -0.14, 4.12),
        (1.68 * x, -0.42, 4.20),
        (2.02 * x, -0.70, 4.12),
        (2.19 * x, -0.88, 3.96),
        (2.23 * x, -0.96, 3.76),
        (2.19 * x, -0.91, 3.56),
        (2.03 * x, -0.76, 3.39),
        (1.70 * x, -0.43, 3.30),
        (1.45 * x, -0.15, 3.35),
        (1.67 * x, -0.52, 3.75),
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
    bevel.width = 0.085
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
        [(1.49 * x, -0.21, 4.03), (1.72 * x, -0.48, 4.02), (2.00 * x, -0.73, 4.00)],
        [(1.48 * x, -0.22, 3.76), (1.76 * x, -0.55, 3.77), (2.14 * x, -0.91, 3.76)],
        [(1.49 * x, -0.21, 3.49), (1.73 * x, -0.48, 3.50), (2.01 * x, -0.76, 3.49)],
    )
    ribs = [
        base.add_poly_curve(
            f"LENOX_FinRib_{label}_{index}",
            points,
            0.025,
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
        influence = max(0.0, min(1.0, (local_x - 1.44) / 0.79))
        concerned.data[index].co.z -= 0.24 * influence
        concerned.data[index].co.y += 0.14 * influence
        confirm.data[index].co.z += 0.17 * influence
        confirm.data[index].co.y -= 0.10 * influence
        thinking.data[index].co.y += 0.05 * influence
    membrane["form_note"] = "compact rounded fan, wide root, forward swept"
    return membrane


def add_expression_curve_v004(
    name: str,
    points: list[tuple[float, float, float]],
    depth: float,
    mat: bpy.types.Material,
    target: bpy.types.Collection,
    channel: str,
) -> bpy.types.Object:
    if name.startswith("LENOX_Brow_"):
        side = -1.0 if name.endswith("_L") else 1.0
        points = [
            (1.16 * side, -1.24, 4.235),
            (0.80 * side, -1.27, 4.245),
            (0.43 * side, -1.24, 4.235),
        ]
        depth = 0.021
        mat = bpy.data.materials["LENOX_PearlOpal_Light"]
        return v003.add_expression_curve_v002(name, points, depth, mat, target, channel)
    if name.startswith("LENOX_UpperLid_"):
        side = -1.0 if name.endswith("_L") else 1.0
        points = [
            (1.23 * side, -1.43, 3.96),
            (0.67 * side, -1.51, 4.12),
            (0.24 * side, -1.42, 4.00),
        ]
        depth = 0.043
        return v003.add_expression_curve_v002(name, points, depth, mat, target, channel)
    return add_expression_curve_v003(name, points, depth, mat, target, channel)


base.add_fin = add_fin_v004
base.add_expression_curve = add_expression_curve_v004


def reduce_eye_rings(character: dict) -> None:
    bpy.context.view_layer.update()
    for label in ("L", "R"):
        sclera = bpy.data.objects[f"LENOX_Eye_Sclera_{label}"]
        for vertex in sclera.data.vertices:
            vertex.co.x *= 0.86
            vertex.co.y *= 0.70
            vertex.co.z *= 0.86
        world = sclera.matrix_world.copy()
        world.translation.y += 0.045
        sclera.matrix_world = world
        sclera.data.update()
        sclera["form_note"] = "thin flat embedded eye surround"


def create_character_v004() -> dict:
    character = v003.create_character_v003()
    character["root"]["version"] = "v004"
    reduce_eye_rings(character)
    return character


def render_self_checks_v004(character: dict, studio: dict) -> None:
    for size in (64, 96):
        base.render(base.ARTIFACT_DIR / f"silhouette-v004-{size}px.png", size, frame=1)
    base.render(base.ARTIFACT_DIR / "inspection-front-neutral.png", 1024, frame=1)
    camera = studio["camera"]
    original_location = camera.location.copy()
    original_rotation = camera.rotation_euler.copy()
    camera.location = (7.4, -11.8, 3.4)
    base.aim_at(camera, (0.0, 0.0, 2.55))
    base.render(base.ARTIFACT_DIR / "inspection-three-quarter.png", 1024, frame=36)
    camera.location = original_location
    camera.rotation_euler = original_rotation


def report_v004(character: dict) -> dict:
    result = v003.report_v003(character)
    result["version"] = "v004"
    result["silhouette_self_checks"] = [
        "silhouette-v004-64px.png",
        "silhouette-v004-96px.png",
    ]
    result["focused_delta"] = [
        "neutral_brow_alignment",
        "compact_fin_ears",
        "reduced_eye_surrounds",
    ]
    result["model_form_state"] = "frozen_after_v004"
    base.REPORT_PATH.write_text(json.dumps(result, indent=2) + "\n", encoding="utf-8")
    return result


def main() -> None:
    base.progress("start")
    base.ensure_dirs()
    base.clear_scene()
    base.progress("scene_cleared")
    character = create_character_v004()
    base.progress("character_complete")
    studio = base.create_studio()
    base.configure_render()
    base.progress("studio_complete")
    base.create_animation(character)
    if character["rig"].animation_data and character["rig"].animation_data.action:
        character["rig"].animation_data.action.name = "LENOX_v004_MotionExpression_Test"
    base.progress("animation_complete")
    render_self_checks_v004(character, studio)
    base.progress("renders_complete")
    bpy.ops.wm.save_as_mainfile(filepath=str(base.BLEND_PATH))
    base.progress("blend_saved")
    base.export_glb(character)
    base.progress("glb_exported")
    result = report_v004(character)
    bpy.ops.wm.save_as_mainfile(filepath=str(base.BLEND_PATH))
    print("LENOX_V004_RESULT=" + json.dumps(result, sort_keys=True))
    if not result["budget"]["glb_pass"] or not result["budget"]["triangles_pass"]:
        raise RuntimeError("LENOX v004 exceeded the hard web budget")


if __name__ == "__main__":
    main()
