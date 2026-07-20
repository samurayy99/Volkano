"""Run the independent GLB verifier against LENOX v003."""

from pathlib import Path

import verify_lenox_v002 as verifier


PROJECT_ROOT = Path(__file__).resolve().parents[2]
verifier.GLB_PATH = PROJECT_ROOT / "public/models/lenox/lenox-v003.glb"
verifier.REPORT_PATH = PROJECT_ROOT / "artifacts/lenox-blender/v003/lenox-v003-verification.json"


if __name__ == "__main__":
    result = verifier.verify()
    print(verifier.json.dumps(result, indent=2))
    raise SystemExit(0 if result["pass"] else 1)
