"""
Test for h3Binner.js antimeridian longitude wrapping.
Verifies that coordinates across the antimeridian line (-180/180 degrees)
are wrapped cleanly relative to cell center longitude so polygons do not span across the world map.
"""

import subprocess
import json

def test_h3_antimeridian_wrapping_js():
    """
    Executes a node script that tests cellIndexToFeature with an H3 cell near the antimeridian
    to ensure coordinates are wrapped without wrapping artifacts (delta > 180 degrees).
    """
    js_code = """
    import { cellIndexToFeature } from './services/h3Binner.js';
    // H3 index near Fiji / antimeridian
    const cellId = '84be625ffffffff';
    const feature = cellIndexToFeature(cellId, { test: true });
    const coords = feature.geometry.coordinates[0];
    const centerLng = feature.properties.h3_lng;
    
    let maxDiff = 0;
    for (const [lng, lat] of coords) {
      const diff = Math.abs(lng - centerLng);
      if (diff > maxDiff) maxDiff = diff;
    }
    
    console.log(JSON.stringify({ success: maxDiff <= 180, maxDiff }));
    """
    
    result = subprocess.run(
        ["node", "--input-type=module", "-e", js_code],
        cwd="backend",
        capture_output=True,
        text=True
    )
    
    assert result.returncode == 0, f"Node script failed: {result.stderr}"
    data = json.loads(result.stdout)
    assert data["success"] is True, f"Antimeridian wrap check failed, max distance from center: {data['maxDiff']}"

if __name__ == "__main__":
    test_h3_antimeridian_wrapping_js()
    print("Antimeridian wrap test passed!")
