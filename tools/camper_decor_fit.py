"""Check catalogue boxes on the generated dashboard shelf, in pixels.

Run python3 -I tools/camper_decor_fit.py [--json]. The JSON table is the source
of DASHBOARD_SLOT_ITEMS. No local spike files or generator side effects are used.
"""
import argparse
import itertools
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from tool_loader import load_tool

cube_tilt = load_tool("cube_tilt")
ROOT = Path(__file__).resolve().parent.parent
RP = ROOT / "packs/yasu_ride_rp"
# Conservative full-footprint rectangles measured on the approved shelf (ADR 0107).
SLOTS = {"dashboard_center": (4.2, 35, -53.057, 7, 4.73),
         "dashboard_left": (11.9, 35, -52.441, 7, 3.50)}
EPS = 1e-6


def dot(a, b):
    return sum(x * y for x, y in zip(a, b))


def sub(a, b):
    return [x - y for x, y in zip(a, b)]


def cross(a, b):
    return [a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0]]


def intersects(a, b):
    """Separating-axis test for two transformed boxes; surface contact is allowed."""
    edges = [[sub(points[i], points[0]) for i in (1, 2, 4)] for points in (a, b)]
    axes = [cross(e[i], e[j]) for e in edges for i, j in ((0, 1), (1, 2), (2, 0))]
    axes += [cross(u, v) for u in edges[0] for v in edges[1]]
    for axis in axes:
        length = dot(axis, axis) ** .5
        if length < EPS:
            continue
        pa, pb = [[dot(p, axis) / length for p in points] for points in (a, b)]
        if min(max(pa), max(pb)) - max(min(pa), min(pb)) <= EPS:
            return False
    return True


def model_boxes(path):
    geometry = json.loads(path.read_text())["minecraft:geometry"][0]
    bones = {b["name"]: b for b in geometry["bones"]}
    result = []
    for bone in bones.values():
        for cube in bone.get("cubes", []):
            points = cube_tilt.corners(cube)
            parent = bone
            while parent:
                if any(parent.get("rotation", [])):
                    matrix = cube_tilt.cube_matrix(parent["rotation"])
                    pivot = parent["pivot"]
                    points = [[v + p for v, p in zip(cube_tilt.apply_matrix(matrix, sub(point, pivot)), pivot)]
                              for point in points]
                parent = bones.get(parent.get("parent"))
            result.append(points)
    return result


def supported(lo, hi, shelf):
    """Partition the footprint at every shelf edge to prove complete support."""
    xs = sorted({lo[0], hi[0], *(v for a, b in shelf for v in (a[0], b[0]) if lo[0] < v < hi[0])})
    zs = sorted({lo[2], hi[2], *(v for a, b in shelf for v in (a[2], b[2]) if lo[2] < v < hi[2])})
    return all(any(a[0]-EPS <= x <= b[0]+EPS and a[2]-EPS <= z <= b[2]+EPS for a, b in shelf)
               for x, z in itertools.product([(a+b)/2 for a, b in zip(xs, xs[1:])],
                                              [(a+b)/2 for a, b in zip(zs, zs[1:])]))


def fit_table():
    cab = model_boxes(RP / "models/entity/yasu_ride/camper.geo.json")
    shelf = []
    for points in cab:
        lo = [min(p[i] for p in points) for i in range(3)]
        hi = [max(p[i] for p in points) for i in range(3)]
        if abs(hi[1]-35) < EPS and all(abs(points[i][1]-35) < EPS for i in (2, 3, 6, 7)):
            shelf.append((lo, hi))
    rows = []
    for item in json.loads((ROOT / "tools/camping_gear.json").read_text()):
        boxes = model_boxes(RP / f"models/blocks/yasu_ride/{item['id']}.geo.json")
        points = [p for box in boxes for p in box]
        lo = [min(p[i] for p in points) for i in range(3)]
        hi = [max(p[i] for p in points) for i in range(3)]
        row = {"id": item["id"], "width": round(hi[0]-lo[0], 6), "depth": round(hi[2]-lo[2], 6)}
        for name, (x, y, z, width, depth) in SLOTS.items():
            # Gear uses -x for camper left; the camper entity model uses +x.
            lower = [x-hi[0], y+lo[1], z+lo[2]]
            upper = [x-lo[0], y+hi[1], z+hi[2]]
            box = cube_tilt.corners({"origin": lower, "size": sub(upper, lower)})
            fits = (not item["hanging"] and lo[0] >= -width/2-EPS and hi[0] <= width/2+EPS
                    and lo[2] >= -depth/2-EPS and hi[2] <= depth/2+EPS
                    and supported(lower, upper, shelf))
            # All cab cubes are checked, including windshield, instruments, column and lever.
            row[name] = fits and not any(intersects(box, obstacle) for obstacle in cab)
        rows.append(row)
    return rows


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--json", action="store_true")
    args = parser.parse_args()
    rows = fit_table()
    if args.json:
        print(json.dumps(rows, indent=2))
    else:
        print("| Item | Width | Depth | Centre | Left |")
        print("| --- | ---: | ---: | --- | --- |")
        for r in rows:
            print(f"| {r['id']} | {r['width']:.3f} | {r['depth']:.3f} | {'yes' if r['dashboard_center'] else 'no'} | {'yes' if r['dashboard_left'] else 'no'} |")


if __name__ == "__main__":
    main()
