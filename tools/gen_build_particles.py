"""Generate the solid white build endpoint particle texture (ADR 0183)."""

import sys
from pathlib import Path

# Isolated mode (-I) omits the script directory from the import path.
sys.path.insert(0, str(Path(__file__).resolve().parent))
from tool_loader import load_tool

out = load_tool("texture_io").Outputs("--check" in sys.argv[2:])
texture = Path(sys.argv[1]) / "textures/yasu_build/marker_particle.png"
out.png(texture, 16, 16, lambda x, y: (255, 255, 255, 255))
out.finish("Build particle texture is stale. Run `pnpm generate`:")
