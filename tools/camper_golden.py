"""Compare current camper counts and region placements with an explicit golden directory."""

import argparse
import difflib
import gzip
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from tool_loader import load_tool

ROOT = Path(__file__).resolve().parent.parent
DIFF_CONTEXT_LINES = 8


def _model(document):
    return document["minecraft:geometry"][0] if "minecraft:geometry" in document else document


def _current():
    model = _model(json.loads((ROOT / "packs/yasu_ride_rp/models/entity/yasu_ride/camper.geo.json").read_text()))
    areas = json.loads((ROOT / "tests/packs/fixtures/camper-areas.json").read_text())
    kit = load_tool("camper_kit")
    layout = kit.LAYOUT
    regions = [{"name": r.name, "size": [r.width, r.height], "origin": layout.origin(r.name)}
               for r in kit.REGISTRY.regions()]
    return model, regions, areas


def _counts(model, area=None, ranges=None):
    counts = {}
    for bone in model["bones"]:
        cubes = bone.get("cubes", [])
        if area is None:
            counts[bone["name"]] = len(cubes)
        elif ranges is None:
            count = sum(c.get("_area") == area for c in cubes)
            if count:
                counts[bone["name"]] = count
        elif bone["name"] in ranges.get(area, {}):
            spans = ranges[area][bone["name"]]
            if isinstance(spans[0], int):
                spans = [spans]
            counts[bone["name"]] = sum(len(cubes[start:end + 1]) for start, end in spans)
    return counts


def _regions(regions, area=None):
    return {r["name"]: {"size": list(r["size"]), "origin": list(r.get("packed_origin", r.get("origin", ())))}
            for r in regions if area is None or area in r.get("used_by", {})}


def compare(golden_dir: Path, area=None) -> list[str]:
    current, current_regions, ranges = _current()
    golden = _model(json.loads(gzip.decompress((golden_dir / "final-model.json.gz").read_bytes())))
    golden_regions = json.loads((golden_dir / "final-regions.json").read_text())
    golden_areas = {c.get("_area") for b in golden["bones"] for c in b.get("cubes", [])}
    if area is not None and area not in ranges and area not in golden_areas:
        return [f"Unknown area: {area}"]
    # The spike's base name mentions its borrowed burner patch; production has no patch.
    for region in golden_regions:
        if region.get("source") == "base":
            region["name"] = "base"
    expected_regions = _regions(golden_regions, area)
    actual_regions = _regions(current_regions)
    if area is not None:
        selected = set(expected_regions)
        # Current faces have no spike tags; the registry supplies their owning rectangle.
        layout_regions = {r["name"]: r for r in current_regions}
        for bone in current["bones"]:
            spans = ranges.get(area, {}).get(bone["name"], [])
            if spans and isinstance(spans[0], int):
                spans = [spans]
            for start, end in spans:
                for cube in bone.get("cubes", [])[start:end + 1]:
                    for face in cube.get("uv", {}).values():
                        u, v = face["uv"]
                        du, dv = face["uv_size"]
                        for name, region in layout_regions.items():
                            x, y = region["origin"]
                            w, h = region["size"]
                            if x <= min(u, u + du) and max(u, u + du) <= x + w and y <= min(v, v + dv) and max(v, v + dv) <= y + h:
                                selected.add(name)
        actual_regions = {k: v for k, v in actual_regions.items() if k in selected}
    expected = {"bones": _counts(golden, area), "regions": expected_regions}
    actual = {"bones": _counts(current, area, ranges), "regions": actual_regions}
    lines = lambda value: json.dumps(value, indent=2, sort_keys=True).splitlines()
    return list(difflib.unified_diff(lines(expected), lines(actual), fromfile="golden", tofile="current", lineterm="", n=DIFF_CONTEXT_LINES))


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    commands = parser.add_subparsers(dest="command", required=True)
    command = commands.add_parser("compare")
    command.add_argument("--golden-dir", type=Path, required=True)
    command.add_argument("--area")
    args = parser.parse_args(argv)
    try:
        differences = compare(args.golden_dir, args.area)
    except (OSError, ValueError, KeyError) as error:
        print(f"Cannot compare camper golden: {error}")
        return 1
    print("\n".join(differences) if differences else "Camper counts and regions match")
    return int(bool(differences))


if __name__ == "__main__":
    sys.exit(main())
