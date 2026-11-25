"""Generate the 64x64 doc previews of the Headlight Switch, the Booster, and Nav.

Run: python3 -I tools/gen_vehicle_switch_docs.py docs/images/items/vehicle-switches [--check]
--check writes nothing and exits 1 listing every stale output.
The previews are the item icons from suv_export.py scaled by an integer factor.
"""

import sys
from pathlib import Path

# Isolated mode (-I) omits the script directory from the import path.
sys.path.insert(0, str(Path(__file__).resolve().parent))
from tool_loader import load_tool

texture_io = load_tool("texture_io")
export = load_tool("suv_export")

DOCS = Path(sys.argv[1])
SCALE = 4
SIZE = 16 * SCALE
out = texture_io.Outputs("--check" in sys.argv[2:])

ICONS = {"headlight_switch": export.switch_icon, "booster": export.booster_icon, "nav": export.nav_icon}
for name, icon in ICONS.items():
    out.png(DOCS / f"{name}.png", SIZE, SIZE, lambda x, y, icon=icon: icon(x // SCALE, y // SCALE))

if out.check:
    out.finish("Stale vehicle switch previews:", "Vehicle switch previews are up to date")
