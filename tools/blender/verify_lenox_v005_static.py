"""Verify the LENOX v005 static-form gate and an optional isolated rebuild."""

from __future__ import annotations

import argparse
import json
from pathlib import Path
import struct
import sys

from PIL import Image, ImageChops, ImageStat


PROJECT_ROOT = Path(__file__).resolve().parents[2]
CANONICAL_REPORT = PROJECT_ROOT / "artifacts/lenox-blender/v005/static-form/static-form-report.json"
OUTPUT_REPORT = PROJECT_ROOT / "artifacts/lenox-blender/v005/static-form/static-form-verification.json"
EXPECTED_RENDER_SIZES = {
    "front": (1024, 1024),
    "three_quarter": (1024, 1024),
    "silhouette_96": (96, 96),
    "silhouette_64": (64, 64),
    "reference_overlay": (1024, 1024),
}


def png_size(path: Path) -> tuple[int, int]:
    with path.open("rb") as handle:
        header = handle.read(24)
    if len(header) != 24 or header[:8] != b"\x89PNG\r\n\x1a\n":
        raise ValueError(f"Not a valid PNG: {path}")
    return struct.unpack(">II", header[16:24])


def resolve_report_path(value: str, report_path: Path) -> Path:
    path = Path(value)
    if path.is_absolute():
        return path
    if report_path == CANONICAL_REPORT:
        return PROJECT_ROOT / path
    root = report_path.parents[4]
    return root / path


def load_report(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


def validate_report(report: dict, report_path: Path) -> list[str]:
    failures = []
    if report.get("promotion") != "blocked pending Volkan static-form decision":
        failures.append("static-form promotion is not blocked")
    scene = report.get("scene", {})
    if scene.get("visible_arms") != 8:
        failures.append(f"expected eight visible arms, found {scene.get('visible_arms')}")
    if scene.get("visible_triangles", 0) <= 0:
        failures.append("visible triangle count missing")
    excluded = set(report.get("excluded_until_gate", []))
    required_exclusions = {"rig", "morph targets", "textures", "animation", "GLB", "runtime"}
    if not required_exclusions <= excluded:
        failures.append(f"missing gate exclusions: {sorted(required_exclusions - excluded)}")
    for name, expected_size in EXPECTED_RENDER_SIZES.items():
        record = report.get("renders", {}).get(name)
        if not record:
            failures.append(f"missing render record: {name}")
            continue
        path = resolve_report_path(record["path"], report_path)
        if not path.exists():
            failures.append(f"missing render: {path}")
            continue
        if png_size(path) != expected_size:
            failures.append(f"wrong dimensions for {name}: {png_size(path)}")
    return failures


def compare_rebuilds(canonical: dict, rebuild: dict, canonical_path: Path,
                     rebuild_path: Path) -> tuple[list[str], dict[str, dict[str, float]]]:
    failures = []
    image_metrics = {}
    for key in ("visible_meshes", "visible_vertices", "visible_triangles", "visible_arms"):
        if canonical["scene"].get(key) != rebuild["scene"].get(key):
            failures.append(f"rebuild scene mismatch for {key}")
    for name in EXPECTED_RENDER_SIZES:
        first_path = resolve_report_path(canonical["renders"][name]["path"], canonical_path)
        second_path = resolve_report_path(rebuild["renders"][name]["path"], rebuild_path)
        first = Image.open(first_path).convert("RGB")
        second = Image.open(second_path).convert("RGB")
        statistics = ImageStat.Stat(ImageChops.difference(first, second))
        mean_absolute_error = sum(statistics.mean) / 3.0 / 255.0
        rms = (sum(value * value for value in statistics.rms) / 3.0) ** 0.5 / 255.0
        image_metrics[name] = {"normalized_mae": mean_absolute_error, "normalized_rms": rms}
        if mean_absolute_error > 0.001 or rms > 0.005:
            failures.append(f"isolated rebuild differs visually for {name}: MAE={mean_absolute_error:.6f}, RMS={rms:.6f}")
    if canonical["toolchain"].get("generator_sha256") != rebuild["toolchain"].get("generator_sha256"):
        failures.append("isolated rebuild used a different generator")
    if canonical["toolchain"].get("binary_sha256") != rebuild["toolchain"].get("binary_sha256"):
        failures.append("isolated rebuild used a different Blender binary")
    return failures, image_metrics


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--rebuild-report", type=Path)
    args = parser.parse_args()
    canonical = load_report(CANONICAL_REPORT)
    failures = validate_report(canonical, CANONICAL_REPORT)
    comparison = "not requested"
    image_metrics = {}
    if args.rebuild_report:
        rebuild_path = args.rebuild_report.resolve()
        rebuild = load_report(rebuild_path)
        failures.extend(validate_report(rebuild, rebuild_path))
        rebuild_failures, image_metrics = compare_rebuilds(canonical, rebuild, CANONICAL_REPORT, rebuild_path)
        failures.extend(rebuild_failures)
        comparison = "matching" if not failures else "failed"
    result = {
        "status": "PASS" if not failures else "FAIL",
        "scope": "static form only; no visual approval",
        "canonical_report": str(CANONICAL_REPORT),
        "isolated_rebuild": comparison,
        "image_comparison": image_metrics,
        "failures": failures,
    }
    OUTPUT_REPORT.write_text(json.dumps(result, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(result, indent=2))
    return 0 if not failures else 1


if __name__ == "__main__":
    sys.exit(main())
