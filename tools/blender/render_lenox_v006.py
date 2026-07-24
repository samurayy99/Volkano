"""Re-render the frozen v006 inspection and expression pack from its .blend."""

from pathlib import Path
import math

import bpy
from mathutils import Vector
import numpy as np


PROJECT_ROOT = Path(__file__).resolve().parents[2]
BLEND_PATH = PROJECT_ROOT / "assets/lenox/lenox-v006.blend"
OUT = PROJECT_ROOT / "artifacts/lenox-blender/v006"
EXPORT_COLLECTION = "LENOX_v006_EXPORT"
SCAN_COLLECTION = "LENOX_v006_SCAN_REFERENCE"


def set_shapes(values: dict[str, float]) -> None:
    for obj in bpy.data.objects:
        keys = getattr(getattr(obj, "data", None), "shape_keys", None)
        if not keys:
            continue
        for name in ("Concerned", "Confirm", "Thinking"):
            if name in keys.key_blocks:
                keys.key_blocks[name].value = values.get(name, 0.0)


def render(name: str, size: int, frame: int = 1) -> None:
    scene = bpy.context.scene
    scene.frame_set(frame)
    scene.render.resolution_x = size
    scene.render.resolution_y = size
    scene.render.resolution_percentage = 100
    scene.render.filepath = str(OUT / name)
    bpy.ops.render.render(write_still=True)


def render_expression_contact_sheet() -> None:
    rows = []
    for labels in (("neutral", "observe"), ("concerned", "confirm")):
        images = []
        for label in labels:
            image = bpy.data.images.load(
                str(OUT / f"expression-{label}.png"), check_existing=False,
            )
            pixels = np.asarray(image.pixels[:], dtype=np.float32).reshape(
                image.size[1], image.size[0], 4,
            )
            images.append(pixels)
            bpy.data.images.remove(image)
        rows.append(np.concatenate(images, axis=1))
    pixels = np.concatenate(rows, axis=0)
    sheet = bpy.data.images.new(
        "LENOX_v006_Expression_Contact_Sheet",
        width=pixels.shape[1],
        height=pixels.shape[0],
        alpha=True,
    )
    sheet.pixels.foreach_set(pixels.ravel())
    sheet.filepath_raw = str(OUT / "expression-contact-sheet.png")
    sheet.file_format = "PNG"
    sheet.save()
    bpy.data.images.remove(sheet)


def set_render_collection(name: str, visible: bool) -> None:
    target = bpy.data.collections[name]
    target.hide_render = not visible
    for obj in target.all_objects:
        obj.hide_render = not visible


def set_comparison_camera(camera: bpy.types.Object, view: str) -> None:
    if view == "front":
        camera.location = (0.0, -8.8, 1.90)
        camera.rotation_euler = (math.pi / 2, 0.0, 0.0)
        camera.data.ortho_scale = 4.28
    elif view == "three-quarter":
        camera.location = (5.6, -6.8, 2.65)
        camera.rotation_euler = (
            Vector((0.0, 0.0, 1.90)) - camera.location
        ).to_track_quat("-Z", "Y").to_euler()
        camera.data.ortho_scale = 4.28
    else:
        camera.location = (2.85, -7.9, 2.62)
        camera.rotation_euler = (
            Vector((0.0, -0.05, 2.34)) - camera.location
        ).to_track_quat("-Z", "Y").to_euler()
        camera.data.ortho_scale = 3.02


def render_source_production_contact_sheet() -> None:
    rows = []
    for view in ("front", "three-quarter", "closeup-eye-fin"):
        images = []
        for role in ("source", "production"):
            image = bpy.data.images.load(
                str(OUT / f"look-{role}-{view}.png"), check_existing=False,
            )
            image.scale(512, 512)
            pixels = np.asarray(image.pixels[:], dtype=np.float32).reshape(512, 512, 4)
            images.append(pixels)
            bpy.data.images.remove(image)
        rows.append(np.concatenate(images, axis=1))
    pixels = np.concatenate(rows, axis=0)
    sheet = bpy.data.images.new(
        "LENOX_v006_Source_Production_Contact_Sheet",
        width=1024, height=1536, alpha=True,
    )
    sheet.pixels.foreach_set(pixels.ravel())
    sheet.filepath_raw = str(OUT / "source-production-look-contact-sheet.png")
    sheet.file_format = "PNG"
    sheet.save()
    bpy.data.images.remove(sheet)


def render_source_production_pair(view: str) -> None:
    images = []
    for role in ("source", "production"):
        image = bpy.data.images.load(
            str(OUT / f"look-{role}-{view}.png"), check_existing=False,
        )
        image.scale(1024, 1024)
        images.append(np.asarray(image.pixels[:], dtype=np.float32).reshape(1024, 1024, 4))
        bpy.data.images.remove(image)
    pixels = np.concatenate(images, axis=1)
    pair = bpy.data.images.new(
        f"LENOX_v006_Source_Production_{view}", width=2048, height=1024, alpha=True,
    )
    pair.pixels.foreach_set(pixels.ravel())
    pair.filepath_raw = str(OUT / f"source-production-{view}.png")
    pair.file_format = "PNG"
    pair.save()
    bpy.data.images.remove(pair)


def render_look_recovery_pack(camera: bpy.types.Object) -> None:
    reef = bpy.data.objects["INSPECTION_Reef_Backdrop"]
    ground = bpy.data.objects["INSPECTION_Ground"]
    set_shapes({})
    bpy.context.scene.frame_set(1)
    reef.hide_render = True
    ground.hide_render = False
    for role in ("source", "production"):
        set_render_collection(SCAN_COLLECTION, role == "source")
        set_render_collection(EXPORT_COLLECTION, role == "production")
        for view in ("front", "three-quarter", "closeup-eye-fin"):
            set_comparison_camera(camera, view)
            render(f"look-{role}-{view}.png", 1024, 1)
    render_source_production_pair("three-quarter")
    render_source_production_pair("closeup-eye-fin")
    render_source_production_contact_sheet()
    set_render_collection(SCAN_COLLECTION, False)
    set_render_collection(EXPORT_COLLECTION, True)
    reef.hide_render = False
    ground.hide_render = True
    for view in ("front", "three-quarter", "closeup-eye-fin"):
        set_comparison_camera(camera, view)
        render(f"reef-production-{view}.png", 1024, 1)
    reef.hide_render = True
    ground.hide_render = False
    set_comparison_camera(camera, "front")


bpy.ops.wm.open_mainfile(filepath=str(BLEND_PATH))
OUT.mkdir(parents=True, exist_ok=True)
camera = bpy.data.objects["INSPECTION_Camera"]
scene = bpy.context.scene
scene.camera = camera
scene.render.engine = "BLENDER_EEVEE"
scene.render.image_settings.file_format = "PNG"
scene.render.film_transparent = False

camera.location = (0, -8.8, 1.90)
camera.rotation_euler = (math.pi / 2, 0, 0)
set_shapes({})
render("inspection-front-neutral.png", 1024)
render("silhouette-v006-96px.png", 96)
render("silhouette-v006-64px.png", 64)

camera.location = (5.6, -6.8, 2.65)
camera.rotation_euler = (Vector((0, 0, 1.90)) - camera.location).to_track_quat("-Z", "Y").to_euler()
render("inspection-three-quarter.png", 1024, 24)

camera.location = (0, -8.8, 1.90)
camera.rotation_euler = (math.pi / 2, 0, 0)
for label, values in (
    ("neutral", {}),
    ("observe", {"Thinking": 0.42}),
    ("concerned", {"Concerned": 1.0}),
    ("confirm", {"Confirm": 1.0}),
):
    set_shapes(values)
    render(f"expression-{label}.png", 512)
set_shapes({})
render_expression_contact_sheet()
render_look_recovery_pack(camera)
print("LENOX v006 inspection pack rendered")
