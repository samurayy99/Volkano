"""Independent GLB and runtime-contract audit for LENOX v006."""

from __future__ import annotations

import importlib.util
import json
from pathlib import Path
import sys


PROJECT_ROOT = Path(__file__).resolve().parents[2]
GLB_PATH = PROJECT_ROOT / "public/models/lenox/lenox-v006.glb"
REPORT_PATH = PROJECT_ROOT / "artifacts/lenox-blender/v006/lenox-v006-verification.json"
BASE_PATH = Path(__file__).with_name("verify_lenox_v005.py")

SPEC = importlib.util.spec_from_file_location("lenox_v005_verifier_core", BASE_PATH)
if SPEC is None or SPEC.loader is None:
    raise RuntimeError(f"Could not load verifier core from {BASE_PATH}")
core = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(core)
core.GLB_PATH = GLB_PATH
core.REPORT_PATH = REPORT_PATH


def node_by_name(gltf: dict, name: str) -> dict | None:
    return next((node for node in gltf.get("nodes", []) if node.get("name") == name), None)


def nonzero_influence_count(gltf: dict, binary: bytes, primitive: dict) -> int:
    weights = []
    for semantic in ("WEIGHTS_0", "WEIGHTS_1"):
        accessor = primitive.get("attributes", {}).get(semantic)
        if accessor is not None:
            weights.append(list(core.accessor_values(gltf, binary, accessor) or ()))
    if not weights:
        return 0
    maximum = 0
    for vertex_index in range(len(weights[0])):
        count = sum(
            1
            for block in weights
            for value in block[vertex_index]
            if value > 1e-4
        )
        maximum = max(maximum, count)
    return maximum


def audit() -> dict:
    result = core.audit()
    gltf, binary = core.read_glb(GLB_PATH)
    failures = [
        failure for failure in result["failures"]
        if not failure.startswith("expected eight visible arm meshes")
    ]

    root = node_by_name(gltf, "LENOX_ROOT")
    if root is None:
        failures.append("LENOX_ROOT metadata node missing")
        root_extras = {}
    else:
        root_extras = root.get("extras", {})
    if root_extras.get("visible_arm_count") != 8:
        failures.append("visible-arm metadata is not eight")
    if root_extras.get("primary_control_chains") != 6:
        failures.append("primary-control-chain metadata is not six")

    body = node_by_name(gltf, "LENOX_Body_Arms_Retopology")
    if body is None:
        failures.append("retopologized body/primary-arm cage missing")
        body_extras = {}
    else:
        body_extras = body.get("extras", {})
    if body_extras.get("authored_visible_arms") != 6:
        failures.append("primary visible-arm cage metadata is not six")

    secondary_names = {
        "LENOX_Arm_Secondary_Rear_L",
        "LENOX_Arm_Secondary_Rear_R",
    }
    node_names = {node.get("name", "") for node in gltf.get("nodes", [])}
    missing_secondary = sorted(secondary_names - node_names)
    if missing_secondary:
        failures.append(f"secondary coupled arms missing: {missing_secondary}")

    max_influences = 0
    unskinned_deform_meshes = []
    nodes = gltf.get("nodes", [])
    meshes = gltf.get("meshes", [])
    for node in nodes:
        mesh_index = node.get("mesh")
        if mesh_index is None:
            continue
        mesh = meshes[mesh_index]
        for primitive in mesh.get("primitives", []):
            attributes = primitive.get("attributes", {})
            if "JOINTS_0" in attributes:
                max_influences = max(max_influences, nonzero_influence_count(gltf, binary, primitive))
            if node.get("name") in secondary_names | {"LENOX_Body_Arms_Retopology"} and "JOINTS_0" not in attributes:
                unskinned_deform_meshes.append(node.get("name"))
    if max_influences > 2:
        failures.append(f"more than two bone influences per exported vertex: {max_influences}")
    if unskinned_deform_meshes:
        failures.append(f"deformable meshes lack skin attributes: {sorted(set(unskinned_deform_meshes))}")

    extensions = set(gltf.get("extensionsUsed", [])) | set(gltf.get("extensionsRequired", []))
    if "EXT_texture_webp" in extensions:
        failures.append("WebP extension present; v006 contract requires standard embedded images")

    animation_names = result.get("animation_names", [])
    if animation_names != ["LENOX_v006_MotionExpression_Test"]:
        failures.append(f"unexpected animation set: {animation_names}")

    result.update({
        "pass": not failures,
        "failures": failures,
        "declared_visible_arm_count": root_extras.get("visible_arm_count"),
        "declared_primary_control_chains": root_extras.get("primary_control_chains"),
        "primary_visible_arm_cage_count": body_extras.get("authored_visible_arms"),
        "secondary_coupled_arm_nodes": sorted(secondary_names & node_names),
        "maximum_nonzero_bone_influences": max_influences,
        "extensions_used_or_required": sorted(extensions),
        "runtime_promotion": "eligible" if not failures else "blocked",
    })
    REPORT_PATH.write_text(json.dumps(result, indent=2) + "\n", encoding="utf-8")
    return result


if __name__ == "__main__":
    verification = audit()
    print(json.dumps(verification, indent=2))
    sys.exit(0 if verification["pass"] else 1)
