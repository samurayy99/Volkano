"""Export the frozen LENOX v006 production .blend as the runtime GLB."""

from pathlib import Path

import bpy


PROJECT_ROOT = Path(__file__).resolve().parents[2]
BLEND_PATH = PROJECT_ROOT / "assets/lenox/lenox-v006.blend"
GLB_PATH = PROJECT_ROOT / "public/models/lenox/lenox-v006.glb"
EXPORT_COLLECTION = "LENOX_v006_EXPORT"


bpy.ops.wm.open_mainfile(filepath=str(BLEND_PATH))
collection = bpy.data.collections[EXPORT_COLLECTION]
for obj in collection.all_objects:
    obj.hide_viewport = False
    obj.hide_render = False
bpy.context.view_layer.active_layer_collection = (
    bpy.context.view_layer.layer_collection.children[EXPORT_COLLECTION]
)

bpy.ops.export_scene.gltf(
    filepath=str(GLB_PATH),
    export_format="GLB",
    use_selection=False,
    use_active_collection=True,
    use_active_collection_with_nested=True,
    export_all_vertex_colors=True,
    export_extras=True,
    export_apply=False,
    export_skins=True,
    export_morph=True,
    export_animations=True,
    export_frame_range=True,
    export_image_format="AUTO",
    export_draco_mesh_compression_enable=False,
    export_yup=True,
)
print(f"LENOX v006 exported from frozen blend: {GLB_PATH}")
