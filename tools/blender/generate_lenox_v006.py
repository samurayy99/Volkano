"""Build the production LENOX v006 asset from Volkan's canonical-derived scan.

The scan is immutable visual evidence, not runtime topology. This generator:
1. creates a closed high-resolution sculpt source with voxel remeshing;
2. derives a deterministic 34k-triangle export cage;
3. transfers the authored color field without inheriting fragmented topology;
4. adds art-directable eyes, fins, face channels, six control chains and two
   coupled secondary arms;
5. bakes a tangent normal map, creates web-sized material maps, renders the
   inspection pack, saves the Blender source and exports an uncompressed GLB.

Reference command (currently verified with Blender 5.2 LTS):
  blender --background --factory-startup --python tools/blender/generate_lenox_v006.py
"""

from __future__ import annotations

from array import array
import hashlib
import json
import math
from pathlib import Path
import sys

import bpy
from mathutils import Vector
from mathutils.bvhtree import BVHTree
import numpy as np


PROJECT_ROOT = Path(__file__).resolve().parents[2]
SOURCE_PATH = PROJECT_ROOT / "assets/lenox/source/lenox-v006-generated-source.glb"
REFERENCE_PATH = PROJECT_ROOT / "docs/character/lenox-canonical-reference.png"
BLEND_PATH = PROJECT_ROOT / "assets/lenox/lenox-v006.blend"
GLB_PATH = PROJECT_ROOT / "public/models/lenox/lenox-v006.glb"
TEXTURE_DIR = PROJECT_ROOT / "assets/lenox/textures/v006"
BASE_COLOR_PATH = TEXTURE_DIR / "lenox-v006-base-color.jpg"
NORMAL_PATH = TEXTURE_DIR / "lenox-v006-normal.png"
ROUGHNESS_PATH = TEXTURE_DIR / "lenox-v006-roughness.png"
IRIS_PATH = TEXTURE_DIR / "lenox-v006-iris.png"
REEF_BACKGROUND_PATH = PROJECT_ROOT / "public/studio/world/hero-keyframe.jpg"
ARTIFACT_DIR = PROJECT_ROOT / "artifacts/lenox-blender/v006"
REPORT_PATH = ARTIFACT_DIR / "lenox-v006-report.json"
LANDMARK_PATH = ARTIFACT_DIR / "lenox-v006-reference-manifest.json"

EXPORT_COLLECTION = "LENOX_v006_EXPORT"
SCULPT_COLLECTION = "LENOX_v006_SCULPT_SOURCE"
SCAN_COLLECTION = "LENOX_v006_SCAN_REFERENCE"
TARGET_HEIGHT = 3.74
SCULPT_VOXEL = 0.016
TARGET_BODY_TRIS = 34_000
MAP_SIZE = 512


ARM_PATHS = {
    "Lead_L": (
        (-0.24, -0.30, 1.42), (-0.36, -0.88, 0.86),
        (-0.45, -1.14, 0.31), (-0.24, -1.22, 0.16), (-0.16, -1.23, 0.48),
    ),
    "Lead_R": (
        (0.24, -0.30, 1.42), (0.36, -0.88, 0.86),
        (0.45, -1.14, 0.31), (0.24, -1.22, 0.16), (0.16, -1.23, 0.48),
    ),
    "Support_Front_L": (
        (-0.52, -0.14, 1.34), (-0.86, -0.72, 0.82),
        (-1.05, -1.02, 0.27), (-0.84, -1.10, 0.49),
    ),
    "Support_Front_R": (
        (0.52, -0.14, 1.34), (0.86, -0.72, 0.82),
        (1.05, -1.02, 0.27), (0.84, -1.10, 0.49),
    ),
    "Support_Side_L": (
        (-0.72, 0.10, 1.30), (-1.30, -0.18, 0.82),
        (-1.52, -0.48, 0.42), (-1.32, -0.58, 1.02),
    ),
    "Support_Side_R": (
        (0.72, 0.10, 1.30), (1.30, -0.18, 0.82),
        (1.52, -0.48, 0.42), (1.32, -0.58, 1.02),
    ),
}

SECONDARY_PATHS = {
    "L": (
        (-0.61, -0.03, 1.28), (-0.83, -0.37, 1.13), (-0.98, -0.63, 0.91),
        (-0.94, -0.78, 0.69), (-0.74, -0.83, 0.76), (-0.75, -0.85, 0.97),
    ),
    "R": (
        (0.61, -0.02, 1.28), (0.83, -0.36, 1.13), (0.98, -0.62, 0.91),
        (0.94, -0.77, 0.69), (0.74, -0.82, 0.76), (0.75, -0.84, 0.97),
    ),
}


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def ensure_directories() -> None:
    for path in (
        BLEND_PATH, GLB_PATH, BASE_COLOR_PATH, NORMAL_PATH, ROUGHNESS_PATH,
        IRIS_PATH, REPORT_PATH,
    ):
        path.parent.mkdir(parents=True, exist_ok=True)


def clear_scene() -> None:
    bpy.ops.wm.read_factory_settings(use_empty=True)


def collection(name: str, *, hidden: bool = False) -> bpy.types.Collection:
    result = bpy.data.collections.new(name)
    bpy.context.scene.collection.children.link(result)
    result.hide_render = hidden
    result.hide_viewport = hidden
    return result


def move_to_collection(obj: bpy.types.Object, target: bpy.types.Collection) -> None:
    for owner in tuple(obj.users_collection):
        owner.objects.unlink(obj)
    target.objects.link(obj)


def activate(obj: bpy.types.Object) -> None:
    bpy.ops.object.select_all(action="DESELECT")
    obj.hide_viewport = False
    obj.hide_render = False
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj


def apply_modifier(obj: bpy.types.Object, modifier: bpy.types.Modifier) -> None:
    activate(obj)
    bpy.ops.object.modifier_apply(modifier=modifier.name)


def triangle_count(obj: bpy.types.Object) -> int:
    obj.data.calc_loop_triangles()
    return len(obj.data.loop_triangles)


def make_image(name: str, path: Path, pixels: np.ndarray, *, non_color: bool) -> bpy.types.Image:
    image = bpy.data.images.new(name, width=MAP_SIZE, height=MAP_SIZE, alpha=True)
    # Blender 5.2 clears generated pixel buffers when the colorspace changes.
    # Configure it before writing data.
    image.colorspace_settings.name = "Non-Color" if non_color else "sRGB"
    image.pixels[:] = pixels.astype(np.float32).ravel().tolist()
    image.update()
    image.filepath_raw = str(path)
    image.file_format = "PNG"
    image.save()
    return image


def build_material_maps() -> tuple[bpy.types.Image, bpy.types.Image]:
    yy, xx = np.mgrid[0:MAP_SIZE, 0:MAP_SIZE].astype(np.float32)
    u = (xx + 0.5) / MAP_SIZE
    v = (yy + 0.5) / MAP_SIZE
    field = (
        np.sin(u * 71.0 + np.sin(v * 17.0))
        + np.sin(v * 89.0 + u * 11.0)
        + np.sin((u + v) * 113.0)
    ) / 3.0
    micro = np.sin(u * 337.0 + np.sin(v * 97.0)) * np.sin(v * 283.0 + u * 43.0)
    rough = np.clip(0.36 + field * 0.055 + micro * 0.018, 0.25, 0.48)
    rough_pixels = np.stack((rough, rough, rough, np.ones_like(rough)), axis=-1)
    roughness = make_image("LENOX_v006_Roughness", ROUGHNESS_PATH, rough_pixels, non_color=True)

    px = u * 2.0 - 1.0
    py = v * 2.0 - 1.0
    radius = np.sqrt(px * px + py * py)
    angle = np.arctan2(py, px)
    fibers = 0.5 + 0.25 * (
        np.sin(angle * 37.0 + radius * 31.0 + np.sin(angle * 5.0) * 2.1)
        + np.sin(angle * 71.0 - radius * 17.0) * 0.55
    )
    fibers = np.clip(fibers, 0.0, 1.0)
    radial = np.clip(1.0 - radius, 0.0, 1.0)
    lower = np.clip((-py + 0.18) / 1.05, 0.0, 1.0) * radial
    gold = np.exp(-((radius - 0.57) / 0.24) ** 2) * lower * (0.45 + fibers * 0.55)
    iris_r = 0.022 + radial * 0.030 + fibers * 0.020 + gold * 0.42
    iris_g = 0.085 + radial * 0.100 + fibers * 0.040 + gold * 0.34
    iris_b = 0.042 + radial * 0.040 + (1.0 - fibers) * 0.016 + gold * 0.035
    limbus = np.clip((radius - 0.80) / 0.13, 0.0, 1.0)
    iris_rgb = np.stack((iris_r, iris_g, iris_b), axis=-1) * (1.0 - limbus[..., None] * 0.78)
    pupil_edge = np.clip((radius - 0.30) / 0.085, 0.0, 1.0)[..., None]
    pupil_color = np.array((0.003, 0.010, 0.008), dtype=np.float32)
    iris_rgb = pupil_color + (iris_rgb - pupil_color) * pupil_edge
    iris_rgb = np.clip(iris_rgb, 0.0, 1.0)
    iris_pixels = np.concatenate((iris_rgb, np.ones((*radius.shape, 1), dtype=np.float32)), axis=-1)
    iris = make_image("LENOX_v006_Iris", IRIS_PATH, iris_pixels, non_color=False)
    return roughness, iris


def principled_material(name: str, color: tuple[float, float, float, float], roughness: float,
                        metallic: float = 0.0, coat: float = 0.0) -> bpy.types.Material:
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    mat.diffuse_color = color
    bsdf = mat.node_tree.nodes.get("Principled BSDF")
    bsdf.inputs["Base Color"].default_value = color
    bsdf.inputs["Roughness"].default_value = roughness
    bsdf.inputs["Metallic"].default_value = metallic
    for key in ("Coat Weight", "Clearcoat"):
        if key in bsdf.inputs:
            bsdf.inputs[key].default_value = coat
    for key in ("Coat Roughness", "Clearcoat Roughness"):
        if key in bsdf.inputs:
            bsdf.inputs[key].default_value = 0.10
    return mat


def create_scan_and_cage(scan_collection: bpy.types.Collection,
                         sculpt_collection: bpy.types.Collection,
                         export_collection: bpy.types.Collection) -> tuple[bpy.types.Object, bpy.types.Object, bpy.types.Object]:
    bpy.ops.import_scene.gltf(filepath=str(SOURCE_PATH))
    meshes = [obj for obj in bpy.context.scene.objects if obj.type == "MESH"]
    if len(meshes) != 1:
        raise RuntimeError(f"Expected one scan mesh, found {len(meshes)}")
    scan = meshes[0]
    scan.name = "SOURCE_LENOX_v006_ImmutableScan"
    scale = TARGET_HEIGHT / scan.dimensions.z
    scan.scale = (scale, scale, scale)
    activate(scan)
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    lowest = min((scan.matrix_world @ vertex.co).z for vertex in scan.data.vertices)
    scan.location.z -= lowest
    bpy.ops.object.transform_apply(location=True, rotation=False, scale=False)
    move_to_collection(scan, scan_collection)
    scan.hide_render = True

    sculpt = scan.copy()
    sculpt.data = scan.data.copy()
    sculpt.name = "SCULPT_LENOX_v006_High"
    sculpt_collection.objects.link(sculpt)
    activate(sculpt)
    sculpt.data.remesh_voxel_size = SCULPT_VOXEL
    sculpt.data.remesh_voxel_adaptivity = 0.0
    bpy.ops.object.voxel_remesh()
    smooth = sculpt.modifiers.new("Sculpt organic continuity", "SMOOTH")
    smooth.factor = 0.24
    smooth.iterations = 2
    apply_modifier(sculpt, smooth)
    fin_group = sculpt.vertex_groups.new(name="LENOX Fin edge softening")
    for vertex in sculpt.data.vertices:
        x, _, z = vertex.co
        if abs(x) > 0.98 and 1.92 < z < 2.78:
            weight = min(1.0, max(0.0, (abs(x) - 0.98) / 0.42))
            fin_group.add((vertex.index,), weight, "REPLACE")
    fin_smooth = sculpt.modifiers.new("Local fin tip rounding", "SMOOTH")
    fin_smooth.vertex_group = fin_group.name
    fin_smooth.factor = 0.50
    fin_smooth.iterations = 6
    apply_modifier(sculpt, fin_smooth)
    sculpt["source_role"] = "closed high-resolution sculpt source; subdivision alone is not the sculpt"
    sculpt["fin_recovery"] = "local tip/outer-edge smoothing only; body and arm form unchanged"
    transfer_source_look_to_sculpt(scan, sculpt)
    shape_eye_sockets(sculpt)
    sculpt.hide_render = True

    cage = sculpt.copy()
    cage.data = sculpt.data.copy()
    cage.name = "LENOX_Body_Arms_Retopology"
    export_collection.objects.link(cage)
    activate(cage)
    source_tris = triangle_count(cage)
    decimate = cage.modifiers.new("Deterministic export retopology", "DECIMATE")
    decimate.decimate_type = "COLLAPSE"
    decimate.ratio = TARGET_BODY_TRIS / source_tris
    decimate.use_collapse_triangulate = True
    apply_modifier(cage, decimate)
    for polygon in cage.data.polygons:
        polygon.use_smooth = True
    cage["retopology_contract"] = "closed deformable cage derived from high sculpt; scan fragments excluded"
    cage["authored_visible_arms"] = 6
    return scan, sculpt, cage


def shape_eye_sockets(sculpt: bpy.types.Object) -> None:
    for vertex in sculpt.data.vertices:
        x, y, z = vertex.co
        if y > -0.68:
            continue
        for center_x in (-0.56, 0.56):
            radius = math.sqrt(
                ((x - center_x) / 0.36) ** 2 + ((z - 2.16) / 0.40) ** 2
            )
            if radius >= 1.0:
                continue
            influence = (1.0 - radius) ** 2
            vertex.co.y += 0.115 * influence
            break
    sculpt.data.update()
    sculpt["eye_socket_construction"] = (
        "local source-eye recess only; body, crown, fins and arms unchanged"
    )


def smart_unwrap(obj: bpy.types.Object, name: str, margin: float) -> None:
    while obj.data.uv_layers:
        obj.data.uv_layers.remove(obj.data.uv_layers[0])
    obj.data.uv_layers.new(name=name)
    activate(obj)
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.uv.smart_project(
        angle_limit=math.radians(66.0), island_margin=margin,
        area_weight=0.15, correct_aspect=True, scale_to_bounds=True,
    )
    bpy.ops.object.mode_set(mode="OBJECT")


def recover_source_colors(colors: np.ndarray) -> np.ndarray:
    rgb = colors[..., :3].copy()
    luminance = np.sum(rgb * np.array((0.2126, 0.7152, 0.0722)), axis=-1, keepdims=True)
    target = luminance.copy()
    target -= np.clip(luminance - 0.68, 0.0, 0.32) * 0.48
    target += np.clip(0.16 - luminance, 0.0, 0.16) * 0.22
    chroma = (rgb - luminance) * 1.08
    recovered = np.clip(target + chroma, 0.0, 1.0)
    return np.concatenate((recovered, colors[..., 3:4]), axis=-1).astype(np.float32)


def suppress_isolated_source_outliers(mesh: bpy.types.Mesh, colors: np.ndarray) -> np.ndarray:
    edge_vertices = np.empty(len(mesh.edges) * 2, dtype=np.int32)
    mesh.edges.foreach_get("vertices", edge_vertices)
    edge_vertices = edge_vertices.reshape(-1, 2)
    result = colors.copy()
    for _ in range(2):
        neighbor_sum = np.zeros((len(result), 3), dtype=np.float32)
        neighbor_count = np.zeros((len(result), 1), dtype=np.float32)
        np.add.at(neighbor_sum, edge_vertices[:, 0], result[edge_vertices[:, 1], :3])
        np.add.at(neighbor_sum, edge_vertices[:, 1], result[edge_vertices[:, 0], :3])
        np.add.at(neighbor_count[:, 0], edge_vertices[:, 0], 1.0)
        np.add.at(neighbor_count[:, 0], edge_vertices[:, 1], 1.0)
        neighbor_mean = neighbor_sum / np.maximum(neighbor_count, 1.0)
        result[:, :3] = result[:, :3] * 0.86 + neighbor_mean * 0.14
        luminance = result[:, :3] @ np.array((0.2126, 0.7152, 0.0722), dtype=np.float32)
        neighbor_luminance = neighbor_mean @ np.array((0.2126, 0.7152, 0.0722), dtype=np.float32)
        isolated_dark = (luminance < neighbor_luminance - 0.26) & (neighbor_luminance > 0.20)
        result[isolated_dark, :3] = neighbor_mean[isolated_dark]
    return result


def grade_baked_base_color(image: bpy.types.Image) -> None:
    width, height = image.size
    pixels = np.asarray(image.pixels[:], dtype=np.float32).reshape(height, width, 4)
    rgb = pixels[..., :3]
    luminance = np.sum(rgb * np.array((0.2126, 0.7152, 0.0722)), axis=-1, keepdims=True)
    chroma = np.max(rgb, axis=-1, keepdims=True) - np.min(rgb, axis=-1, keepdims=True)
    exposure = 0.84 - np.clip(chroma / 0.35, 0.0, 1.0) * 0.12
    graded = np.clip(luminance * exposure + (rgb - luminance) * 1.46, 0.0, 1.0)
    pixels[..., :3] = graded
    image.pixels[:] = pixels.astype(np.float32).ravel().tolist()
    image.update()


def source_color_on_sculpt(scan: bpy.types.Object, sculpt: bpy.types.Object) -> bpy.types.Attribute:
    source_mesh = scan.data
    source_mesh.calc_loop_triangles()
    triangles = [tuple(triangle.vertices) for triangle in source_mesh.loop_triangles]
    bvh = BVHTree.FromPolygons(
        [vertex.co.copy() for vertex in source_mesh.vertices],
        triangles,
        all_triangles=True,
    )
    source_uv = source_mesh.uv_layers.active.data
    source_image = next(
        node.image for material in source_mesh.materials if material and material.use_nodes
        for node in material.node_tree.nodes
        if node.type == "TEX_IMAGE" and node.image and node.image.name.startswith("Image_0")
    )
    width, height = source_image.size
    source_pixels = np.asarray(source_image.pixels[:], dtype=np.float32).reshape(height, width, 4)

    def barycentric(point: Vector, a: Vector, b: Vector, c: Vector) -> tuple[float, float, float]:
        ab = b - a
        ac = c - a
        ap = point - a
        d00 = ab.dot(ab)
        d01 = ab.dot(ac)
        d11 = ac.dot(ac)
        d20 = ap.dot(ab)
        d21 = ap.dot(ac)
        denominator = d00 * d11 - d01 * d01
        if abs(denominator) < 1e-12:
            return 1.0, 0.0, 0.0
        weight_b = (d11 * d20 - d01 * d21) / denominator
        weight_c = (d00 * d21 - d01 * d20) / denominator
        return 1.0 - weight_b - weight_c, weight_b, weight_c

    def sample(uv: Vector) -> np.ndarray:
        x = (uv.x % 1.0) * (width - 1)
        y = (uv.y % 1.0) * (height - 1)
        x0 = int(math.floor(x))
        y0 = int(math.floor(y))
        x1 = min(x0 + 1, width - 1)
        y1 = min(y0 + 1, height - 1)
        blend_x = x - x0
        blend_y = y - y0
        lower = source_pixels[y0, x0] * (1.0 - blend_x) + source_pixels[y0, x1] * blend_x
        upper = source_pixels[y1, x0] * (1.0 - blend_x) + source_pixels[y1, x1] * blend_x
        return lower * (1.0 - blend_y) + upper * blend_y

    colors = np.empty((len(sculpt.data.vertices), 4), dtype=np.float32)
    distances = np.empty(len(sculpt.data.vertices), dtype=np.float32)
    for vertex in sculpt.data.vertices:
        location, _, triangle_index, distance = bvh.find_nearest(vertex.co)
        if triangle_index is None:
            raise RuntimeError(f"Source color transfer missed sculpt vertex {vertex.index}")
        triangle = source_mesh.loop_triangles[triangle_index]
        a, b, c = (source_mesh.vertices[index].co for index in triangle.vertices)
        weight_a, weight_b, weight_c = barycentric(location, a, b, c)
        uv_a, uv_b, uv_c = (source_uv[index].uv for index in triangle.loops)
        colors[vertex.index] = sample(uv_a * weight_a + uv_b * weight_b + uv_c * weight_c)
        distances[vertex.index] = distance
    colors = suppress_isolated_source_outliers(sculpt.data, recover_source_colors(colors))
    attribute = sculpt.data.color_attributes.new(
        name="LENOX_SourceColor", type="FLOAT_COLOR", domain="POINT",
    )
    attribute.data.foreach_set("color", colors.ravel())
    sculpt["source_color_transfer"] = (
        "nearest source triangle + barycentric UV + bilinear texture sampling; not nearest vertex"
    )
    sculpt["source_color_max_distance"] = float(distances.max())
    sculpt["source_color_p99_distance"] = float(np.percentile(distances, 99.0))
    return attribute


def transfer_source_look_to_sculpt(scan: bpy.types.Object, sculpt: bpy.types.Object) -> None:
    source_attribute = source_color_on_sculpt(scan, sculpt)
    material = principled_material(
        "LENOX_v006_SourceLook_High", (1.0, 1.0, 1.0, 1.0), 0.42,
    )
    nodes = material.node_tree.nodes
    vertex_color = nodes.new("ShaderNodeVertexColor")
    vertex_color.layer_name = source_attribute.name
    material.node_tree.links.new(
        vertex_color.outputs["Color"], nodes["Principled BSDF"].inputs["Base Color"],
    )
    sculpt.data.materials.clear()
    sculpt.data.materials.append(material)
    sculpt.hide_render = True
    sculpt.hide_viewport = True
    sculpt["source_look_transfer"] = (
        "source triangle UV sampling -> recovered high-sculpt color field -> cage diffuse bake"
    )


def unwrap_cage(cage: bpy.types.Object) -> None:
    smart_unwrap(cage, "UVMap", 0.006)


def bake_base_color(sculpt: bpy.types.Object, cage: bpy.types.Object) -> bpy.types.Image:
    pixels = np.empty((MAP_SIZE, MAP_SIZE, 4), dtype=np.float32)
    pixels[:] = (0.55, 0.72, 0.62, 1.0)
    image = bpy.data.images.new(
        "LENOX_v006_BaseColor", width=MAP_SIZE, height=MAP_SIZE, alpha=False,
    )
    image.colorspace_settings.name = "sRGB"
    image.pixels[:] = pixels.ravel().tolist()
    bake_material = bpy.data.materials.new("LENOX_v006_BaseColor_BakeTarget")
    bake_material.use_nodes = True
    image_node = bake_material.node_tree.nodes.new("ShaderNodeTexImage")
    image_node.name = "LENOX v006 Base Color Bake"
    image_node.image = image
    bake_material.node_tree.nodes.active = image_node
    cage.data.materials.clear()
    cage.data.materials.append(bake_material)
    sculpt_owners = tuple(sculpt.users_collection)
    for owner in sculpt_owners:
        owner.hide_viewport = False
        owner.hide_render = False
    bpy.ops.object.select_all(action="DESELECT")
    sculpt.hide_viewport = False
    sculpt.hide_render = False
    sculpt.select_set(True)
    cage.select_set(True)
    bpy.context.view_layer.objects.active = cage
    scene = bpy.context.scene
    scene.render.engine = "CYCLES"
    scene.cycles.device = "CPU"
    scene.render.bake.use_clear = False
    scene.render.bake.margin = 12
    scene.render.bake.use_selected_to_active = True
    scene.render.bake.cage_extrusion = 0.018
    scene.render.bake.max_ray_distance = 0.06
    scene.render.bake.use_pass_direct = False
    scene.render.bake.use_pass_indirect = False
    scene.render.bake.use_pass_color = True
    bpy.ops.object.bake(type="DIFFUSE")
    grade_baked_base_color(image)
    image.filepath_raw = str(BASE_COLOR_PATH)
    image.file_format = "JPEG"
    scene.render.image_settings.quality = 92
    image.save()
    for attribute in list(cage.data.color_attributes):
        cage.data.color_attributes.remove(attribute)
    sculpt.hide_render = True
    sculpt.hide_viewport = True
    for owner in sculpt_owners:
        owner.hide_viewport = True
        owner.hide_render = True
    return image


def bake_normal(sculpt: bpy.types.Object, cage: bpy.types.Object) -> bpy.types.Image:
    normal_pixels = np.empty((MAP_SIZE, MAP_SIZE, 4), dtype=np.float32)
    normal_pixels[:] = (0.5, 0.5, 1.0, 1.0)
    image = make_image("LENOX_v006_Normal", NORMAL_PATH, normal_pixels, non_color=True)
    bake_mat = bpy.data.materials.new("LENOX_v006_BakeTarget")
    bake_mat.use_nodes = True
    node = bake_mat.node_tree.nodes.new("ShaderNodeTexImage")
    node.name = "LENOX v006 Tangent Normal Bake"
    node.image = image
    bake_mat.node_tree.nodes.active = node
    cage.data.materials.clear()
    cage.data.materials.append(bake_mat)
    sculpt_owners = tuple(sculpt.users_collection)
    for owner in sculpt_owners:
        owner.hide_viewport = False
        owner.hide_render = False
    bpy.ops.object.select_all(action="DESELECT")
    sculpt.hide_viewport = False
    sculpt.hide_render = False
    sculpt.select_set(True)
    cage.select_set(True)
    bpy.context.view_layer.objects.active = cage
    scene = bpy.context.scene
    scene.render.engine = "CYCLES"
    scene.cycles.device = "CPU"
    scene.render.bake.use_clear = False
    scene.render.bake.margin = 12
    scene.render.bake.use_selected_to_active = True
    scene.render.bake.cage_extrusion = 0.018
    scene.render.bake.max_ray_distance = 0.06
    scene.render.bake.normal_space = "TANGENT"
    bpy.ops.object.bake(type="NORMAL")
    image.filepath_raw = str(NORMAL_PATH)
    image.file_format = "PNG"
    image.save()
    sculpt.hide_render = True
    sculpt.hide_viewport = True
    for owner in sculpt_owners:
        owner.hide_viewport = True
        owner.hide_render = True
    return image


def configure_skin_material(cage: bpy.types.Object, base_color: bpy.types.Image,
                            normal: bpy.types.Image,
                            roughness: bpy.types.Image) -> bpy.types.Material:
    mat = principled_material("LENOX_PearlOpal_Skin_v006", (1, 1, 1, 1), 0.36, 0.0, 0.26)
    nodes = mat.node_tree.nodes
    links = mat.node_tree.links
    bsdf = nodes.get("Principled BSDF")
    color_node = nodes.new("ShaderNodeTexImage")
    color_node.name = "Source-look recovered Base Color"
    color_node.image = base_color
    links.new(color_node.outputs["Color"], bsdf.inputs["Base Color"])
    normal_node = nodes.new("ShaderNodeTexImage")
    normal_node.image = normal
    normal_node.image.colorspace_settings.name = "Non-Color"
    normal_map = nodes.new("ShaderNodeNormalMap")
    normal_map.inputs["Strength"].default_value = 0.48
    links.new(normal_node.outputs["Color"], normal_map.inputs["Color"])
    links.new(normal_map.outputs["Normal"], bsdf.inputs["Normal"])
    rough_node = nodes.new("ShaderNodeTexImage")
    rough_node.image = roughness
    rough_node.image.colorspace_settings.name = "Non-Color"
    links.new(rough_node.outputs["Color"], bsdf.inputs["Roughness"])
    cage.data.materials.clear()
    cage.data.materials.append(mat)
    return mat


def create_armature(target: bpy.types.Collection) -> tuple[bpy.types.Object, bpy.types.Object]:
    root = bpy.data.objects.new("LENOX_ROOT", None)
    target.objects.link(root)
    root["version"] = "v006"
    root["visible_arm_count"] = 8
    root["primary_control_chains"] = 6
    root["form_authority"] = "docs/character/lenox-canonical-reference.png"

    data = bpy.data.armatures.new("LENOX_Rig")
    rig = bpy.data.objects.new("LENOX_Rig", data)
    target.objects.link(rig)
    rig.parent = root
    activate(rig)
    bpy.ops.object.mode_set(mode="EDIT")

    def bone(name: str, head: tuple[float, float, float], tail: tuple[float, float, float],
             parent: str | None = None, connected: bool = False) -> bpy.types.EditBone:
        result = data.edit_bones.new(name)
        result.head = head
        result.tail = tail
        if parent:
            result.parent = data.edit_bones[parent]
            result.use_connect = connected
        return result

    bone("Root", (0, 0, 0), (0, 0, 1.20))
    bone("Head", (0, 0, 1.42), (0, 0, 3.48), "Root")
    bone("Eye.L", (-0.56, -1.02, 2.16), (-0.56, -1.34, 2.16), "Head")
    bone("Eye.R", (0.56, -1.02, 2.16), (0.56, -1.34, 2.16), "Head")
    bone("Fin.L", (-0.92, -0.08, 2.36), (-1.55, -0.34, 2.42), "Head")
    bone("Fin.R", (0.92, -0.08, 2.36), (1.55, -0.34, 2.42), "Head")
    for chain, points in ARM_PATHS.items():
        previous = "Root"
        for index in range(len(points) - 1):
            name = f"Arm_{chain}_{index + 1:02d}"
            bone(name, points[index], points[index + 1], previous, connected=index > 0)
            previous = name
    bpy.ops.object.mode_set(mode="OBJECT")

    anchor = bpy.data.objects.new("LENOX_FACE_ANCHOR", None)
    target.objects.link(anchor)
    anchor.empty_display_type = "SPHERE"
    anchor.empty_display_size = 0.05
    anchor.matrix_world.translation = Vector((0.0, -1.50, 2.13))
    world = anchor.matrix_world.copy()
    anchor.parent = rig
    anchor.parent_type = "BONE"
    anchor.parent_bone = "Head"
    anchor.matrix_world = world
    return root, rig


def distance_to_segment(point: Vector, start: Vector, end: Vector) -> tuple[float, float]:
    segment = end - start
    t = max(0.0, min(1.0, (point - start).dot(segment) / max(segment.length_squared, 1e-8)))
    return (point - (start + segment * t)).length, t


def add_weight(group: bpy.types.VertexGroup, vertex: int, weight: float) -> None:
    if weight > 1e-5:
        group.add((vertex,), float(weight), "REPLACE")


def skin_body(cage: bpy.types.Object, rig: bpy.types.Object) -> None:
    group_names = [bone.name for bone in rig.data.bones]
    groups = {name: cage.vertex_groups.new(name=name) for name in group_names}
    chains = {name: tuple(Vector(point) for point in points) for name, points in ARM_PATHS.items()}
    for vertex in cage.data.vertices:
        point = cage.matrix_world @ vertex.co
        x, _, z = point
        if abs(x) > 0.92 and z > 1.82:
            side = "L" if x < 0 else "R"
            amount = min(1.0, max(0.0, (abs(x) - 0.92) / 0.34))
            add_weight(groups[f"Fin.{side}"], vertex.index, amount)
            add_weight(groups["Head"], vertex.index, 1.0 - amount)
            continue
        if z >= 1.68:
            add_weight(groups["Head"], vertex.index, 1.0)
            continue
        if z >= 1.40:
            head_weight = (z - 1.40) / 0.28
            add_weight(groups["Head"], vertex.index, head_weight)
            add_weight(groups["Root"], vertex.index, 1.0 - head_weight)
            continue
        candidates = []
        for chain_name, points in chains.items():
            for segment_index in range(len(points) - 1):
                distance, t = distance_to_segment(point, points[segment_index], points[segment_index + 1])
                candidates.append((distance, chain_name, segment_index, t))
        distance, chain_name, segment_index, t = min(candidates, key=lambda item: item[0])
        influence = min(1.0, max(0.0, (1.42 - z) / 0.32))
        influence *= min(1.0, max(0.0, (0.62 - distance) / 0.26))
        if influence < 0.05:
            add_weight(groups["Root"], vertex.index, 1.0)
            continue
        bone_count = len(chains[chain_name]) - 1
        current = min(segment_index, bone_count - 1)
        next_index = min(current + 1, bone_count - 1)
        current_name = f"Arm_{chain_name}_{current + 1:02d}"
        next_name = f"Arm_{chain_name}_{next_index + 1:02d}"
        if current == next_index:
            add_weight(groups[current_name], vertex.index, influence)
            add_weight(groups["Root"], vertex.index, 1.0 - influence)
        elif influence < 0.5:
            nearest_name = current_name if t < 0.5 else next_name
            add_weight(groups[nearest_name], vertex.index, influence)
            add_weight(groups["Root"], vertex.index, 1.0 - influence)
        else:
            add_weight(groups[current_name], vertex.index, 1.0 - t)
            add_weight(groups[next_name], vertex.index, t)
    modifier = cage.modifiers.new("LENOX v006 Armature", "ARMATURE")
    modifier.object = rig
    cage.parent = rig


def parent_to_bone(obj: bpy.types.Object, rig: bpy.types.Object, bone: str) -> None:
    world = obj.matrix_world.copy()
    obj.parent = rig
    obj.parent_type = "BONE"
    obj.parent_bone = bone
    obj.matrix_world = world


def add_uv_sphere(name: str, location: tuple[float, float, float], scale: tuple[float, float, float],
                  material: bpy.types.Material, target: bpy.types.Collection,
                  segments: int = 24, rings: int = 16) -> bpy.types.Object:
    bpy.ops.mesh.primitive_uv_sphere_add(segments=segments, ring_count=rings, location=location)
    obj = bpy.context.object
    obj.name = name
    obj.scale = scale
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    obj.data.materials.append(material)
    for polygon in obj.data.polygons:
        polygon.use_smooth = True
    move_to_collection(obj, target)
    return obj


def add_iris_disc(name: str, center: tuple[float, float, float], radius_x: float, radius_z: float,
                  material: bpy.types.Material, target: bpy.types.Collection,
                  yaw: float = 0.0) -> bpy.types.Object:
    segments = 64
    rings = 8
    depth = 0.045
    vertices = [(
        center[0] + depth * math.sin(yaw),
        center[1] - depth * math.cos(yaw),
        center[2],
    )]
    uvs = [(0.5, 0.5)]
    for ring in range(1, rings + 1):
        radius = ring / rings
        y = center[1] - depth * (1.0 - radius * radius)
        for index in range(segments):
            angle = index / segments * math.tau
            x = center[0] + math.cos(angle) * radius_x * radius
            rotated_x = center[0] + (x - center[0]) * math.cos(yaw) - (y - center[1]) * math.sin(yaw)
            rotated_y = center[1] + (x - center[0]) * math.sin(yaw) + (y - center[1]) * math.cos(yaw)
            vertices.append((
                rotated_x,
                rotated_y,
                center[2] + math.sin(angle) * radius_z * radius,
            ))
            uvs.append((
                0.5 + math.cos(angle) * 0.5 * radius,
                0.5 + math.sin(angle) * 0.5 * radius,
            ))
    faces = [(0, 1 + index, 1 + (index + 1) % segments) for index in range(segments)]
    for ring in range(rings - 1):
        inner = 1 + ring * segments
        outer = inner + segments
        for index in range(segments):
            next_index = (index + 1) % segments
            faces.append((
                inner + index, outer + index,
                outer + next_index, inner + next_index,
            ))
    mesh = bpy.data.meshes.new(f"{name}_Mesh")
    mesh.from_pydata(vertices, [], faces)
    mesh.update()
    uv = mesh.uv_layers.new(name="UVMap")
    for loop in mesh.loops:
        uv.data[loop.index].uv = uvs[loop.vertex_index]
    obj = bpy.data.objects.new(name, mesh)
    mesh.materials.append(material)
    target.objects.link(obj)
    for polygon in mesh.polygons:
        polygon.use_smooth = True
    obj["eye_surface"] = "domed iris/cornea with integrated pupil and limbus"
    return obj


def add_ribbon(name: str, paths: tuple[tuple[tuple[float, float, float], ...], ...], width: float,
               material: bpy.types.Material, target: bpy.types.Collection, channel: str) -> bpy.types.Object:
    vertices = []
    faces = []
    for path in paths:
        start = len(vertices)
        for x, y, z in path:
            vertices.extend(((x, y + 0.004, z - width * 0.5), (x, y - 0.004, z + width * 0.5)))
        for index in range(len(path) - 1):
            a = start + index * 2
            faces.append((a, a + 2, a + 3, a + 1))
    mesh = bpy.data.meshes.new(f"{name}_Mesh")
    mesh.from_pydata(vertices, [], faces)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    mesh.materials.append(material)
    target.objects.link(obj)
    solidify = obj.modifiers.new("Skin-near thickness", "SOLIDIFY")
    solidify.thickness = 0.015
    bevel = obj.modifiers.new("Soft integrated edge", "BEVEL")
    bevel.width = 0.010
    bevel.segments = 2
    apply_modifier(obj, solidify)
    apply_modifier(obj, bevel)
    basis = obj.shape_key_add(name="Basis")
    concerned = obj.shape_key_add(name="Concerned")
    confirm = obj.shape_key_add(name="Confirm")
    thinking = obj.shape_key_add(name="Thinking")
    for index, point in enumerate(basis.data):
        if channel == "brow":
            inner = max(0.0, 1.0 - abs(point.co.x) / 0.90)
            concerned.data[index].co.z += 0.070 * inner
            confirm.data[index].co.z += 0.015 * (1.0 - inner)
            thinking.data[index].co.z += 0.025 * (-1.0 if point.co.x < 0 else 1.0)
        elif channel == "lid":
            concerned.data[index].co.z -= 0.045
            confirm.data[index].co.z += 0.015
            thinking.data[index].co.z -= 0.022
        elif channel == "mouth":
            edge = abs(point.co.x) / 0.22
            concerned.data[index].co.z += 0.018 * edge
            confirm.data[index].co.z += 0.035 * edge
            thinking.data[index].co.z += 0.012 * (1.0 if point.co.x > 0 else -1.0)
    obj["expression_channel"] = channel
    return obj


def create_fin(label: str, side: float, material: bpy.types.Material,
               target: bpy.types.Collection, rig: bpy.types.Object) -> bpy.types.Object:
    paths = (
        ((0.99 * side, -0.08, 2.49), (1.10 * side, -0.13, 2.52),
         (1.22 * side, -0.19, 2.55), (1.32 * side, -0.23, 2.56)),
        ((0.99 * side, -0.09, 2.33), (1.11 * side, -0.14, 2.34),
         (1.24 * side, -0.20, 2.33), (1.34 * side, -0.24, 2.30)),
        ((0.99 * side, -0.08, 2.17), (1.10 * side, -0.13, 2.16),
         (1.21 * side, -0.19, 2.13), (1.30 * side, -0.23, 2.09)),
    )
    fin = add_ribbon(f"LENOX_Fin_{label}", paths, 0.018, material, target, "fin")
    basis = fin.data.shape_keys.key_blocks["Basis"]
    concerned = fin.data.shape_keys.key_blocks["Concerned"]
    confirm = fin.data.shape_keys.key_blocks["Confirm"]
    thinking = fin.data.shape_keys.key_blocks["Thinking"]
    for index, point in enumerate(basis.data):
        influence = max(0.0, min(1.0, (abs(point.co.x) - 0.91) / 0.72))
        concerned.data[index].co.z -= 0.065 * influence
        concerned.data[index].co.y -= 0.040 * influence
        confirm.data[index].co.z += 0.055 * influence
        confirm.data[index].co.y -= 0.030 * influence
        thinking.data[index].co.y -= 0.050 * influence
    parent_to_bone(fin, rig, f"Fin.{label}")
    fin["form_note"] = "compact forward-swept organic fan with broad head root"
    return fin


def create_tube(name: str, points: tuple[tuple[float, float, float], ...], radii: tuple[float, ...],
                material: bpy.types.Material, target: bpy.types.Collection) -> bpy.types.Object:
    ring_segments = 10
    controls = tuple(Vector(point) for point in points)
    vectors = []
    smooth_radii = []
    samples = 4
    for segment in range(len(controls) - 1):
        p0 = controls[max(0, segment - 1)]
        p1 = controls[segment]
        p2 = controls[segment + 1]
        p3 = controls[min(len(controls) - 1, segment + 2)]
        for sample in range(samples):
            t = sample / samples
            point = 0.5 * ((2.0 * p1) + (-p0 + p2) * t
                           + (2.0 * p0 - 5.0 * p1 + 4.0 * p2 - p3) * t * t
                           + (-p0 + 3.0 * p1 - 3.0 * p2 + p3) * t * t * t)
            vectors.append(point)
            smooth_radii.append(radii[segment] * (1.0 - t) + radii[segment + 1] * t)
    vectors.append(controls[-1])
    smooth_radii.append(radii[-1])
    vertices = []
    for index, point in enumerate(vectors):
        if index == 0:
            tangent = (vectors[1] - point).normalized()
        elif index == len(vectors) - 1:
            tangent = (point - vectors[index - 1]).normalized()
        else:
            tangent = (vectors[index + 1] - vectors[index - 1]).normalized()
        axis = tangent.cross(Vector((0, 0, 1)))
        if axis.length < 0.01:
            axis = tangent.cross(Vector((0, 1, 0)))
        axis.normalize()
        binormal = tangent.cross(axis).normalized()
        for ring in range(ring_segments):
            angle = ring / ring_segments * math.tau
            offset = (axis * math.cos(angle) + binormal * math.sin(angle)) * smooth_radii[index]
            vertices.append(tuple(point + offset))
    faces = []
    for index in range(len(vectors) - 1):
        for ring in range(ring_segments):
            a = index * ring_segments + ring
            b = index * ring_segments + (ring + 1) % ring_segments
            c = (index + 1) * ring_segments + (ring + 1) % ring_segments
            d = (index + 1) * ring_segments + ring
            faces.append((a, b, c, d))
    faces.append(tuple(reversed(range(ring_segments))))
    end = (len(vectors) - 1) * ring_segments
    faces.append(tuple(end + ring for ring in range(ring_segments)))
    mesh = bpy.data.meshes.new(f"{name}_Mesh")
    mesh.from_pydata(vertices, [], faces)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    mesh.materials.append(material)
    target.objects.link(obj)
    for polygon in mesh.polygons:
        polygon.use_smooth = True
    return obj


def skin_secondary_arm(obj: bpy.types.Object, rig: bpy.types.Object, chain: str) -> None:
    bone_count = 3
    groups = [obj.vertex_groups.new(name=f"Arm_{chain}_{index + 1:02d}") for index in range(bone_count)]
    ring_segments = 10
    for vertex in obj.data.vertices:
        ring_count = len(obj.data.vertices) // ring_segments
        t = (vertex.index // ring_segments) / max(1, ring_count - 1)
        scaled = t * bone_count
        first = min(bone_count - 1, int(scaled))
        second = min(bone_count - 1, first + 1)
        blend = scaled - int(scaled)
        add_weight(groups[first], vertex.index, 1.0 - blend if first != second else 1.0)
        if first != second:
            add_weight(groups[second], vertex.index, blend)
    modifier = obj.modifiers.new("Coupled side-chain deformation", "ARMATURE")
    modifier.object = rig
    obj.parent = rig
    obj["visible_role"] = "secondary"
    obj["control_chain"] = chain


def create_secondary_arms(material: bpy.types.Material, target: bpy.types.Collection,
                          rig: bpy.types.Object) -> list[bpy.types.Object]:
    result = []
    for label, chain in (("L", "Support_Side_L"), ("R", "Support_Side_R")):
        points = SECONDARY_PATHS[label]
        arm = create_tube(
            f"LENOX_Arm_Secondary_Rear_{label}", points,
            (0.18, 0.17, 0.145, 0.11, 0.075, 0.035), material, target,
        )
        skin_secondary_arm(arm, rig, chain)
        result.append(arm)
    return result


def create_face_and_eyes(rig: bpy.types.Object, target: bpy.types.Collection,
                         materials: dict[str, bpy.types.Material]) -> dict[str, bpy.types.Object]:
    iris_parts = []
    for label, side in (("L", -1.0), ("R", 1.0)):
        center_x = 0.56 * side
        iris = add_iris_disc(
            f"LENOX_Eye_Iris_{label}", (center_x, -1.010, 2.16), 0.292, 0.319,
            materials["iris"], target, yaw=math.radians(7.0) * side,
        )
        parent_to_bone(iris, rig, f"Eye.{label}")
        iris["eye_construction"] = (
            "small domed cornea inset into source-derived facial socket; no sclera sphere"
        )
        iris_parts.append(iris)
    mouth = add_ribbon(
        "LENOX_Mouth_Closed",
        (((-0.22, -1.335, 1.73), (-0.11, -1.36, 1.70), (0.0, -1.37, 1.69),
          (0.11, -1.36, 1.70), (0.22, -1.335, 1.73)),),
        0.020, materials["coral"], target, "mouth",
    )
    mouth["mouth_constraint"] = "closed_lip_only; no teeth, tongue or open cartoon mouth"
    parent_to_bone(mouth, rig, "Head")
    return {"irises": iris_parts, "mouth": mouth}


def create_materials(roughness: bpy.types.Image, iris_image: bpy.types.Image) -> dict[str, bpy.types.Material]:
    materials = {
        "skin_light": principled_material("LENOX_PearlOpal_Light_v006", (0.68, 0.78, 0.62, 1), 0.44, 0.0, 0.24),
        "skin_aux": principled_material("LENOX_PearlOpal_Aux_v006", (0.38, 0.64, 0.50, 1), 0.42, 0.0, 0.16),
        "sclera": principled_material("LENOX_Eye_Sclera_v006", (0.77, 0.80, 0.67, 1), 0.24, 0.0, 0.38),
        "iris": principled_material("LENOX_Eye_IrisCornea_v006", (0.08, 0.22, 0.12, 1), 0.15, 0.0, 0.58),
        "opal": principled_material("LENOX_Opal_Highlight_v006", (0.88, 0.91, 0.74, 1), 0.18, 0.0, 0.48),
        "coral": principled_material("LENOX_Face_Coral_v006", (0.60, 0.27, 0.22, 1), 0.34, 0.0, 0.15),
    }
    iris_mat = materials["iris"]
    iris_bsdf = iris_mat.node_tree.nodes["Principled BSDF"]
    for key in ("Coat Roughness", "Clearcoat Roughness"):
        if key in iris_bsdf.inputs:
            iris_bsdf.inputs[key].default_value = 0.18
    texture = iris_mat.node_tree.nodes.new("ShaderNodeTexImage")
    texture.image = iris_image
    iris_mat.node_tree.links.new(texture.outputs["Color"], iris_mat.node_tree.nodes["Principled BSDF"].inputs["Base Color"])
    return materials


def create_animation(rig: bpy.types.Object) -> None:
    scene = bpy.context.scene
    scene.frame_start = 1
    scene.frame_end = 96
    scene.render.fps = 24
    for frame, mode in ((1, "rest"), (24, "observe"), (48, "concerned"), (72, "confirm"), (96, "rest")):
        scene.frame_set(frame)
        for pose in rig.pose.bones:
            pose.rotation_mode = "XYZ"
            if pose.name.startswith("Arm_"):
                seed = sum(ord(char) for char in pose.name) * 0.017
                lead = "Lead" in pose.name
                amplitude = 0.065 if lead else 0.020
                if mode == "confirm" and lead:
                    amplitude += 0.075
                if mode == "concerned":
                    amplitude *= 0.55
                pose.rotation_euler = (
                    math.sin(frame * 0.039 + seed) * amplitude * 0.24,
                    math.cos(frame * 0.031 + seed) * amplitude * 0.15,
                    math.sin(frame * 0.027 + seed) * amplitude,
                )
                pose.keyframe_insert("rotation_euler")
        for eye_name in ("Eye.L", "Eye.R"):
            eye = rig.pose.bones[eye_name]
            eye.rotation_mode = "XYZ"
            eye.rotation_euler.x = 0.028 if mode == "observe" else (-0.010 if mode == "concerned" else 0.0)
            eye.rotation_euler.z = 0.018 if mode == "observe" else 0.0
            eye.keyframe_insert("rotation_euler")
        for fin_name in ("Fin.L", "Fin.R"):
            fin = rig.pose.bones[fin_name]
            fin.rotation_mode = "XYZ"
            fin.rotation_euler.z = 0.035 if mode == "confirm" else (-0.025 if mode == "concerned" else 0.0)
            fin.keyframe_insert("rotation_euler")
    if rig.animation_data and rig.animation_data.action:
        rig.animation_data.action.name = "LENOX_v006_MotionExpression_Test"


def set_shapes(value_map: dict[str, float]) -> None:
    for obj in bpy.data.objects:
        keys = getattr(getattr(obj, "data", None), "shape_keys", None)
        if not keys:
            continue
        for name in ("Concerned", "Confirm", "Thinking"):
            if name in keys.key_blocks:
                keys.key_blocks[name].value = value_map.get(name, 0.0)


def create_reef_backdrop() -> bpy.types.Object:
    bpy.ops.mesh.primitive_plane_add(
        size=2, location=(0.0, 1.80, 2.14), rotation=(math.pi / 2, 0.0, 0.0),
    )
    backdrop = bpy.context.object
    backdrop.name = "INSPECTION_Reef_Backdrop"
    backdrop.scale = (3.84, 2.14, 1.0)
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    material = bpy.data.materials.new("Inspection Real Reef Context")
    material.use_nodes = True
    nodes = material.node_tree.nodes
    links = material.node_tree.links
    nodes.clear()
    texture = nodes.new("ShaderNodeTexImage")
    texture.image = bpy.data.images.load(str(REEF_BACKGROUND_PATH), check_existing=True)
    emission = nodes.new("ShaderNodeEmission")
    emission.inputs["Strength"].default_value = 0.72
    output = nodes.new("ShaderNodeOutputMaterial")
    links.new(texture.outputs["Color"], emission.inputs["Color"])
    links.new(emission.outputs["Emission"], output.inputs["Surface"])
    backdrop.data.materials.append(material)
    backdrop.hide_render = True
    return backdrop


def create_studio() -> tuple[bpy.types.Object, bpy.types.Object, bpy.types.Object]:
    world = bpy.data.worlds.new("LENOX v006 Reef Inspection World")
    world.use_nodes = True
    world.node_tree.nodes["Background"].inputs["Color"].default_value = (0.72, 0.77, 0.74, 1)
    world.node_tree.nodes["Background"].inputs["Strength"].default_value = 0.38
    bpy.context.scene.world = world
    ground_mat = principled_material("Inspection Ground", (0.68, 0.74, 0.70, 1), 0.62)
    bpy.ops.mesh.primitive_plane_add(size=18, location=(0, 0, -0.012))
    ground = bpy.context.object
    ground.name = "INSPECTION_Ground"
    ground.data.materials.append(ground_mat)
    for name, location, energy, size, color in (
        ("Key", (-3.8, -5.4, 6.0), 720, 4.6, (1.0, 0.91, 0.80)),
        ("Fill", (4.0, -3.2, 3.8), 380, 4.0, (0.78, 0.94, 1.0)),
        ("Rim", (0.0, 3.2, 5.5), 520, 3.2, (0.70, 1.0, 0.92)),
    ):
        bpy.ops.object.light_add(type="AREA", location=location)
        light = bpy.context.object
        light.name = f"INSPECTION_{name}"
        light.data.energy = energy
        light.data.size = size
        light.data.color = color
        direction = Vector((0, 0, 2.0)) - light.location
        light.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()
    bpy.ops.object.camera_add(location=(0, -8.8, 1.90))
    camera = bpy.context.object
    camera.name = "INSPECTION_Camera"
    camera.data.type = "ORTHO"
    camera.data.ortho_scale = 4.28
    camera.rotation_euler = (math.pi / 2, 0, 0)
    bpy.context.scene.camera = camera
    return camera, ground, create_reef_backdrop()


def configure_render() -> None:
    scene = bpy.context.scene
    scene.render.engine = "BLENDER_EEVEE"
    scene.render.image_settings.file_format = "PNG"
    scene.render.resolution_percentage = 100
    scene.render.film_transparent = False
    scene.render.image_settings.color_mode = "RGBA"
    scene.view_settings.look = "AgX - Medium High Contrast"


def render(path: Path, size: int, frame: int = 1) -> None:
    scene = bpy.context.scene
    scene.frame_set(frame)
    scene.render.resolution_x = size
    scene.render.resolution_y = size
    scene.render.filepath = str(path)
    bpy.ops.render.render(write_still=True)


def render_expression_contact_sheet() -> None:
    rows = []
    for labels in (("neutral", "observe"), ("concerned", "confirm")):
        images = []
        for label in labels:
            image = bpy.data.images.load(
                str(ARTIFACT_DIR / f"expression-{label}.png"), check_existing=False,
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
    sheet.filepath_raw = str(ARTIFACT_DIR / "expression-contact-sheet.png")
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
                str(ARTIFACT_DIR / f"look-{role}-{view}.png"), check_existing=False,
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
    sheet.filepath_raw = str(ARTIFACT_DIR / "source-production-look-contact-sheet.png")
    sheet.file_format = "PNG"
    sheet.save()
    bpy.data.images.remove(sheet)


def render_source_production_pair(view: str) -> None:
    images = []
    for role in ("source", "production"):
        image = bpy.data.images.load(
            str(ARTIFACT_DIR / f"look-{role}-{view}.png"), check_existing=False,
        )
        image.scale(1024, 1024)
        images.append(np.asarray(image.pixels[:], dtype=np.float32).reshape(1024, 1024, 4))
        bpy.data.images.remove(image)
    pixels = np.concatenate(images, axis=1)
    pair = bpy.data.images.new(
        f"LENOX_v006_Source_Production_{view}", width=2048, height=1024, alpha=True,
    )
    pair.pixels.foreach_set(pixels.ravel())
    pair.filepath_raw = str(ARTIFACT_DIR / f"source-production-{view}.png")
    pair.file_format = "PNG"
    pair.save()
    bpy.data.images.remove(pair)


def render_look_recovery_pack(camera: bpy.types.Object, ground: bpy.types.Object,
                              reef: bpy.types.Object) -> None:
    set_shapes({})
    bpy.context.scene.frame_set(1)
    reef.hide_render = True
    ground.hide_render = False
    for role in ("source", "production"):
        set_render_collection(SCAN_COLLECTION, role == "source")
        set_render_collection(EXPORT_COLLECTION, role == "production")
        for view in ("front", "three-quarter", "closeup-eye-fin"):
            set_comparison_camera(camera, view)
            render(ARTIFACT_DIR / f"look-{role}-{view}.png", 1024, 1)
    render_source_production_pair("three-quarter")
    render_source_production_pair("closeup-eye-fin")
    render_source_production_contact_sheet()
    set_render_collection(SCAN_COLLECTION, False)
    set_render_collection(EXPORT_COLLECTION, True)
    reef.hide_render = False
    ground.hide_render = True
    for view in ("front", "three-quarter", "closeup-eye-fin"):
        set_comparison_camera(camera, view)
        render(ARTIFACT_DIR / f"reef-production-{view}.png", 1024, 1)
    reef.hide_render = True
    ground.hide_render = False
    set_comparison_camera(camera, "front")


def render_inspection_pack(camera: bpy.types.Object) -> None:
    set_shapes({})
    render(ARTIFACT_DIR / "inspection-front-neutral.png", 1024, 1)
    render(ARTIFACT_DIR / "silhouette-v006-96px.png", 96, 1)
    render(ARTIFACT_DIR / "silhouette-v006-64px.png", 64, 1)
    front_location = camera.location.copy()
    front_rotation = camera.rotation_euler.copy()
    camera.location = (5.6, -6.8, 2.65)
    direction = Vector((0, 0, 1.90)) - camera.location
    camera.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()
    render(ARTIFACT_DIR / "inspection-three-quarter.png", 1024, 24)
    camera.location = front_location
    camera.rotation_euler = front_rotation
    for label, values in (
        ("neutral", {}), ("observe", {"Thinking": 0.42}),
        ("concerned", {"Concerned": 1.0}), ("confirm", {"Confirm": 1.0}),
    ):
        set_shapes(values)
        render(ARTIFACT_DIR / f"expression-{label}.png", 512, 1)
    set_shapes({})
    render_expression_contact_sheet()


def export_glb(export_collection: bpy.types.Collection) -> None:
    bpy.ops.object.select_all(action="DESELECT")
    for obj in export_collection.objects:
        obj.hide_viewport = False
        obj.hide_render = False
        obj.select_set(True)
    bpy.ops.export_scene.gltf(
        filepath=str(GLB_PATH),
        export_format="GLB",
        use_selection=True,
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


def write_reference_manifest() -> None:
    payload = {
        "authority": "docs/character/lenox-canonical-reference.png",
        "visual_approval": False,
        "diagnostic_only": True,
        "reference_bound": ["front silhouette", "eye placement", "fin span", "head-body ratio", "visible arm distribution"],
        "controlled_interpretation": ["side depth", "back of head", "back of fins", "rear arm placement"],
        "notes": "No canonical orthographic side or back references exist; diagnostics never grant visual approval.",
    }
    LANDMARK_PATH.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")


def write_report(cage: bpy.types.Object, sculpt: bpy.types.Object, export_collection: bpy.types.Collection) -> dict:
    material_names = sorted({material.name for obj in export_collection.objects if obj.type == "MESH" for material in obj.data.materials if material})
    mesh_tris = {obj.name: triangle_count(obj) for obj in export_collection.objects if obj.type == "MESH"}
    result = {
        "version": "v006",
        "status": "technical_candidate; visual approval remains with Volkan and team",
        "toolchain": {
            "blender_binary": bpy.app.binary_path,
            "blender_version": bpy.app.version_string,
            "blender_python": sys.version.split()[0],
            "generator_sha256": sha256(Path(__file__)),
            "source_sha256": sha256(SOURCE_PATH),
            "canonical_reference_sha256": sha256(REFERENCE_PATH),
            "command": "blender --background --factory-startup --python tools/blender/generate_lenox_v006.py",
        },
        "geometry": {
            "sculpt_triangles": triangle_count(sculpt),
            "export_mesh_triangles": mesh_tris,
            "export_triangles_total": sum(mesh_tris.values()),
            "visible_arms": 8,
            "primary_control_chains": 6,
            "secondary_mapping": {
                "LENOX_Arm_Secondary_Rear_L": "Arm_Support_Side_L_*",
                "LENOX_Arm_Secondary_Rear_R": "Arm_Support_Side_R_*",
            },
        },
        "materials": material_names,
        "textures": {
            BASE_COLOR_PATH.name: [MAP_SIZE, MAP_SIZE],
            NORMAL_PATH.name: [MAP_SIZE, MAP_SIZE],
            ROUGHNESS_PATH.name: [MAP_SIZE, MAP_SIZE],
            IRIS_PATH.name: [MAP_SIZE, MAP_SIZE],
        },
        "outputs": {
            "blend": str(BLEND_PATH.relative_to(PROJECT_ROOT)),
            "blend_sha256": sha256(BLEND_PATH),
            "glb": str(GLB_PATH.relative_to(PROJECT_ROOT)),
            "glb_sha256": sha256(GLB_PATH),
            "glb_bytes": GLB_PATH.stat().st_size,
        },
        "inspection": [
            "inspection-front-neutral.png", "inspection-three-quarter.png",
            "silhouette-v006-96px.png", "silhouette-v006-64px.png",
            "expression-neutral.png", "expression-observe.png",
            "expression-concerned.png", "expression-confirm.png",
            "expression-contact-sheet.png",
            "look-source-front.png", "look-production-front.png",
            "look-source-three-quarter.png", "look-production-three-quarter.png",
            "look-source-closeup-eye-fin.png", "look-production-closeup-eye-fin.png",
            "source-production-three-quarter.png",
            "source-production-closeup-eye-fin.png",
            "source-production-look-contact-sheet.png",
            "reef-production-front.png", "reef-production-three-quarter.png",
            "reef-production-closeup-eye-fin.png",
        ],
        "visual_self_approval": False,
    }
    REPORT_PATH.write_text(json.dumps(result, indent=2) + "\n", encoding="utf-8")
    return result


def main() -> None:
    ensure_directories()
    clear_scene()
    export_collection = collection(EXPORT_COLLECTION)
    sculpt_collection = collection(SCULPT_COLLECTION, hidden=True)
    scan_collection = collection(SCAN_COLLECTION, hidden=True)
    scan, sculpt, cage = create_scan_and_cage(scan_collection, sculpt_collection, export_collection)
    unwrap_cage(cage)
    normal = bake_normal(sculpt, cage)
    base_color = bake_base_color(sculpt, cage)
    roughness, iris_image = build_material_maps()
    skin = configure_skin_material(cage, base_color, normal, roughness)
    materials = create_materials(roughness, iris_image)
    materials["skin"] = skin
    root, rig = create_armature(export_collection)
    skin_body(cage, rig)
    create_fin("L", -1.0, materials["skin_light"], export_collection, rig)
    create_fin("R", 1.0, materials["skin_light"], export_collection, rig)
    create_secondary_arms(materials["skin_aux"], export_collection, rig)
    create_face_and_eyes(rig, export_collection, materials)
    create_animation(rig)
    camera, ground, reef = create_studio()
    configure_render()
    render_inspection_pack(camera)
    render_look_recovery_pack(camera, ground, reef)
    write_reference_manifest()
    set_shapes({})
    bpy.context.scene.frame_set(1)
    bpy.ops.wm.save_as_mainfile(filepath=str(BLEND_PATH))
    export_glb(export_collection)
    bpy.ops.wm.save_as_mainfile(filepath=str(BLEND_PATH))
    report = write_report(cage, sculpt, export_collection)
    print("LENOX_V006_RESULT=" + json.dumps(report, sort_keys=True))


if __name__ == "__main__":
    main()
