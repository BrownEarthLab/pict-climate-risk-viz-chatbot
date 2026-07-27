"""
Python adapter for the JS parseSdmxObservations function.

Calls Node.js via subprocess to import and invoke the function from
backend/services/sdmxPipeline.js, then returns the result as a Python
list of dicts.
"""

import json
import math
import os
import subprocess
import sys


BACKEND_DIR = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))


class _NanToNullEncoder(json.JSONEncoder):
    """Convert NaN/Infinity to null so Node.js can parse the JSON."""
    def default(self, obj):
        return None

    def encode(self, obj):
        return super().encode(self._replace_nan(obj))

    def _replace_nan(self, val):
        if isinstance(val, float):
            if math.isnan(val) or math.isinf(val):
                return None
            return val
        if isinstance(val, dict):
            return {k: self._replace_nan(v) for k, v in val.items()}
        if isinstance(val, list):
            return [self._replace_nan(v) for v in val]
        return val


def parse_sdmx_observations(sdmx_data: dict, layer_name: str) -> list[dict]:
    """
    Call parseSdmxObservations(sdmxData, layerName) in Node.js.

    Args:
        sdmx_data: The SDMX-JSON payload as a Python dict.
        layer_name: "sea_level", "power_gen", or "water_access".

    Returns:
        List of {geoPictCode, value, year} dicts.
    """
    encoder = _NanToNullEncoder()
    input_json = encoder.encode({"sdmxData": sdmx_data, "layerName": layer_name})
    input_json_escaped = json.dumps(input_json)

    script = f"""
    import {{ parseSdmxObservations }} from "./server.js";

    const input = JSON.parse({input_json_escaped});
    const result = parseSdmxObservations(input.sdmxData, input.layerName);
    process.stdout.write(JSON.stringify(result));
    """

    try:
        proc = subprocess.run(
            ["node", "--input-type=module", "-e", script],
            capture_output=True,
            text=True,
            timeout=10,
            cwd=BACKEND_DIR,
        )
    except subprocess.TimeoutExpired:
        raise RuntimeError("Node.js subprocess timed out (10s) calling parseSdmxObservations")
    except FileNotFoundError:
        raise RuntimeError("Node.js executable not found on PATH")

    if proc.returncode != 0:
        stderr = proc.stderr.strip()
        raise RuntimeError(
            f"Node.js subprocess failed (exit {proc.returncode}): {stderr}"
        )

    stdout = proc.stdout.strip()
    if not stdout:
        return []

    return json.loads(stdout)
