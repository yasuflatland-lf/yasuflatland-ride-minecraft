"""Capture and compare camper cube geometry and atlas region placements."""

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
GOLDEN_AREA_LABELS = {"steering": ("steering", "wheel and column", "lever")}


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


def _tag_current(model, ranges):
    bones = {b["name"]: b.get("cubes", []) for b in model["bones"]}
    for area, selections in ranges.items():
        for name, spans in selections.items():
            if isinstance(spans[0], int):
                spans = [spans]
            for first, last in spans:
                for cube in bones.get(name, [])[first:last + 1]:
                    cube["_area"] = area


def _region_usage(model, regions):
    # Many cubes share swatches. Resolve each distinct UV rectangle just once.
    owners = {}
    for bone in model["bones"]:
        for cube in bone.get("cubes", []):
            for face in cube.get("uv", {}).values():
                u, v = face["uv"]
                du, dv = face["uv_size"]
                rect = (min(u, u + du), min(v, v + dv), max(u, u + du), max(v, v + dv))
                if rect not in owners:
                    owners[rect] = []
                    for region in regions:
                        x, y = region["origin"]
                        w, h = region["size"]
                        if x <= rect[0] and y <= rect[1] and rect[2] <= x + w and rect[3] <= y + h:
                            owners[rect].append(region)
                for region in owners[rect]:
                    region.setdefault("used_by", {})[cube.get("_area", "unassigned")] = True


def _comparison_lines(model, regions, area):
    labels = {alias: name for name, aliases in GOLDEN_AREA_LABELS.items() for alias in aliases}
    cubes = []
    counts = {}
    for bone in model["bones"]:
        if area is None:
            counts[bone["name"]] = 0
        for cube in bone.get("cubes", []):
            tag = cube.get("_area", "unassigned")
            if area is not None and tag not in GOLDEN_AREA_LABELS.get(area, (area,)):
                continue
            owner = labels.get(tag, tag)
            rotation = cube.get("rotation", [0, 0, 0])
            vectors = [cube["origin"], cube["size"], rotation]
            if any(rotation):
                vectors.append(cube["pivot"])
            # JSON permits both 1 and 1.0 for the same coordinate.
            shape = [[int(n) if n == int(n) else n for n in v] for v in vectors]
            name = bone["name"]
            counts[name] = counts.get(name, 0) + 1
            cubes.append(f"{owner} {name} {json.dumps(shape)}")
    summary = json.dumps({"bones": counts, "regions": regions}, indent=2, sort_keys=True)
    return summary.splitlines() + sorted(cubes)


def capture(golden_dir):
    model, regions, ranges = _current()
    _tag_current(model, ranges)
    _region_usage(model, regions)
    golden_dir.mkdir(parents=True)
    (golden_dir / "final-model.json.gz").write_bytes(gzip.compress(json.dumps(model).encode()))
    (golden_dir / "final-regions.json").write_text(json.dumps(regions))


def _regions(regions, area=None):
    return {r["name"]: {"size": list(r["size"]), "origin": list(r.get("packed_origin", r.get("origin", ())))}
            for r in regions if area is None or any(label in r.get("used_by", {}) for label in GOLDEN_AREA_LABELS.get(area, (area,)))}


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
    _tag_current(current, ranges)
    _region_usage(current, current_regions)
    expected_regions = _regions(golden_regions, area)
    selected = set(expected_regions) | set(_regions(current_regions, area))
    actual_regions = {k: v for k, v in _regions(current_regions).items() if k in selected}

    expected = _comparison_lines(golden, expected_regions, area)
    actual = _comparison_lines(current, actual_regions, area)
    return list(difflib.unified_diff(expected, actual, fromfile="golden", tofile="current",
                                     lineterm="", n=DIFF_CONTEXT_LINES))


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    commands = parser.add_subparsers(dest="command", required=True)
    commands.add_parser("capture").add_argument("--golden-dir", type=Path, required=True)
    command = commands.add_parser("compare")
    command.add_argument("--golden-dir", type=Path, required=True)
    command.add_argument("--area")
    args = parser.parse_args(argv)
    try:
        if args.command == "capture":
            capture(args.golden_dir)
            return 0
        differences = compare(args.golden_dir, args.area)
    except (OSError, ValueError, KeyError) as error:
        print(f"Cannot compare camper golden: {error}")
        return 1
    print("\n".join(differences) if differences else "Camper cubes and regions match")
    return int(bool(differences))


if __name__ == "__main__":
    sys.exit(main())
