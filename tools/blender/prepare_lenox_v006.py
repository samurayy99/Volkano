"""Compatibility entrypoint for the production v006 generator.

The former direct-decimation script produced an unrigged scan and must never
overwrite the production GLB. Keep this filename for existing local commands,
but route it through the complete, verified pipeline.
"""

from pathlib import Path
import runpy


runpy.run_path(str(Path(__file__).with_name("generate_lenox_v006.py")), run_name="__main__")
