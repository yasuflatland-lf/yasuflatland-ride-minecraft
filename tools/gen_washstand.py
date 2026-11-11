"""Generate the photo-based Washstand, in pixels with its front at -z (ADR 0246)."""

import argparse
import math
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from tool_loader import load_tool

panels = load_tool("panels")
tilt = load_tool("cube_tilt")
texture_io = load_tool("texture_io")

GEOMETRY = "models/entity/yasu_ride/washstand.geo.json"
TEXTURE = "textures/entity/yasu_ride/washstand.png"
WATER_TEXTURE = "textures/entity/yasu_ride/washstand_water.png"
ANIMATION = "animations/yasu_ride/washstand.anim.json"
TILE = 128
ATLAS = 1024
# macOS and Linux libm sin/cos can differ in the last bit; --check compares parsed JSON exactly.
DECIMALS = 4
SHELF_U, SHELF_V, SHELF_WIDTH, SHELF_HEIGHT = 512, 0, 512, 256
LEG_HALF, LEG_X, LEG_Z = 0.28, 7.72, 4.45
TOP_Y, TOP_THICKNESS = 14.6, 0.8
BOWL_OUT = (6.1, -4.5, 4.5, 0.8, 2)
DECK = (6.05, -4.45, 4.45, 0.8, 2)
IN_RIM = (5.5, -3.9, 2.5, 0.7, 1)
FLOOR = (4.6, -3.1, 1.0, 0.7, 1)
TOP = (8, -5.25, 5.25, 0.05, 2)
DRAIN_Z, FLOOR_Y = -1.05, 13.8
TAP_Z, TAP_BASE, LEVER_Y = 3.5, 16.5, 19.46
LEVER_DEGREES = math.degrees(0.45)
RUN_SECONDS, FLOW_PERIOD = 5.0, 1 / 0.9
FOAM_COUNT, SPLASH_COUNT = 10, 8
LANDING = (0, 14.3, 1.45)
WATER_BONES = ("stream", "film", "foam", "splash")
SLOTS = ("wood_top", "deck", "floor", "shelf", "drain", "overflow", "wood",
         "chrome", "steel", "rod", "porcelain", "inner", "clear", "water", "foam", "foot")
CHROME = ((0, (139, 148, 154)), (0.22, (221, 227, 230)), (0.42, (255, 255, 255)),
          (0.58, (170, 179, 185)), (0.8, (227, 232, 235)), (1, (125, 135, 141)))
ASSEMBLIES = {"basin": {"owner": "gen_washstand", "cubes": 60}}


def rounded(value):
    if isinstance(value, float):
        return round(value, DECIMALS) + 0.0
    if isinstance(value, list):
        return [rounded(v) for v in value]
    if isinstance(value, dict):
        return {k: rounded(v) for k, v in value.items()}
    return value


def face(slot):
    if slot == "shelf":
        return {"uv": [SHELF_U, SHELF_V], "uv_size": [SHELF_WIDTH, SHELF_HEIGHT]}
    n = SLOTS.index(slot)
    return {"uv": [n % 4 * TILE, n // 4 * TILE], "uv_size": [TILE, TILE]}


def box(lo, hi, slot):
    return panels.panel(*lo, *hi, face(slot))


def plate(shape, y0, y1, slot):
    a, zf, zb, *_ = shape
    part = box((-a, y0, zf), (a, y1, zb), "clear")
    part["uv"]["up"] = face(slot)
    return part


def points(y, shape):
    a, zf, zb, r, steps = shape
    result = []
    for x, z, start in ((a-r, zb-r, 0), (-a+r, zb-r, 90),
                        (-a+r, zf+r, 180), (a-r, zf+r, 270)):
        for i in range(steps + 1):
            t = math.radians(start + 90 * i / steps)
            result.append((x+r*math.cos(t), y, z+r*math.sin(t)))
    return result


def length(v):
    return math.sqrt(sum(x*x for x in v))


def unit(v):
    return [x / length(v) for x in v]


def loft(rings, thickness, inward=False):
    result = []
    for (y0, s0), (y1, s1) in zip(rings, rings[1:]):
        a, b = points(y0, s0), points(y1, s1)
        for j in range(len(a)):
            p, q, r, s = a[j], a[(j+1) % len(a)], b[j], b[(j+1) % len(b)]
            u = [(q[i]-p[i]+s[i]-r[i])/2 for i in range(3)]
            v = [(r[i]-p[i]+s[i]-q[i])/2 for i in range(3)]
            c = [(p[i]+q[i]+r[i]+s[i])/4 for i in range(3)]
            ex = unit(u)
            dot = sum(v[i]*ex[i] for i in range(3))
            vp = [v[i]-dot*ex[i] for i in range(3)]
            ey = unit(vp)
            ez = [ex[1]*ey[2]-ex[2]*ey[1], ex[2]*ey[0]-ex[0]*ey[2], ex[0]*ey[1]-ex[1]*ey[0]]
            outward = ez[0]*c[0]+ez[2]*(c[2]-(s0[1]+s0[2])/2)
            if (outward < 0) != inward:
                ey, ez = [-x for x in ey], [-x for x in ez]
            centre = [c[i]-ez[i]*thickness/2 for i in range(3)]
            w, h = length(u)+min(0.16, thickness*0.4), length(vp)+min(0.16, thickness*0.6)
            part = box((centre[0]-w/2, centre[1]-h/2, centre[2]-thickness/2),
                       (centre[0]+w/2, centre[1]+h/2, centre[2]+thickness/2),
                       "inner" if inward else "porcelain")
            # rotation_of uses the vehicle build-frame z sign; furniture uses the game sign.
            rotation = tilt.rotation_of([[ex[i], ey[i], ez[i]] for i in range(3)])
            rotation[2] = -rotation[2]
            part.update(pivot=centre, rotation=rotation)
            result.append(part)
    return result


def tube(a, b, width, slot):
    dx, dy, dz = [b[i]-a[i] for i in range(3)]
    half = width / 2
    if dy == 0:
        part = box((a[0]-half, a[1]-half, a[2]-half),
                   (a[0]+half, a[1]+half, a[2]+length((dx, dy, dz))+half), slot)
        rotation = [0, math.degrees(math.atan2(dx, dz)), 0]
    else:
        part = box((a[0]-half, a[1]-half, a[2]-half),
                   (a[0]+half, a[1]+length((dx, dy, dz))+half, a[2]+half), slot)
        rotation = [0, 0, math.degrees(math.atan2(dx, dy))] if dz == 0 else [
            -math.degrees(math.atan2(dz, dy)), 0, 0]
    part.update(pivot=list(a), rotation=rotation)
    return part


def bone(name, cubes=(), parent="root", pivot=(0, 0, 0)):
    return {"name": name, "parent": parent, "pivot": list(pivot), "cubes": list(cubes)}


def geometry():
    frame = []
    for x in (-LEG_X, LEG_X):
        for z in (-LEG_Z, LEG_Z):
            frame.append(box((x-LEG_HALF, 0.45, z-LEG_HALF), (x+LEG_HALF, TOP_Y, z+LEG_HALF), "steel"))
            frame.extend(panels.disc(0.28, 0, 0.45, face("foot"), bars=4, center=(x, z)))
            frame.append(box((x-0.28, 0.45, z-0.28), (x+0.28, 0.58, z+0.28), "steel"))
    for lo, hi in (((-7.44, 2.4, -4.73), (7.44, 3, -4.18)),
                   ((-7.44, 2.4, 4.18), (7.44, 3, 4.73)),
                   ((-8, 2.4, -4.45), (-7.45, 3, 4.45)),
                   ((7.45, 2.4, -4.45), (8, 3, 4.45)),
                   ((-7.44, 14, 4.18), (7.44, 14.6, 4.73)),
                   ((-7.44, 14, -4.73), (7.44, 14.6, -4.4)),
                   ((-8, 10.4, -4.45), (-7.7, 14.6, 4.45))):
        frame.append(box(lo, hi, "steel"))
    shelf = plate((7.4, -4.18, 4.18), 2.78, 2.84, "shelf")
    shelf["uv"]["down"] = face("shelf")
    frame.append(shelf)
    drawer = [box((-7.3, 10.4, -4.7), (7.3, 14.35, -4), "wood")]
    # Inset the drawer and pull together to preserve the standoff within the 10.5 px depth.
    pull = [(6.6, 13.45, -4.85), (6.6, 13.45, -4.95), (6.42, 13.45, -5.1),
            (-6.42, 13.45, -5.1), (-6.6, 13.45, -4.95), (-6.6, 13.45, -4.85)]
    pull = [(x, y, z+0.07) for x, y, z in pull]
    drawer.extend(tube(a, b, 0.3, "rod") for a, b in zip(pull, pull[1:]))
    top = plate(TOP, TOP_Y, TOP_Y+TOP_THICKNESS, "wood_top")
    for side in ("north", "south", "east", "west"):
        top["uv"][side] = face("wood")
    basin = loft([(13, BOWL_OUT), (15.4, BOWL_OUT),
                  (16.1, (6.15, -4.55, 4.55, 0.8, 2)), (16.5, DECK)], 0.35)
    basin += loft([(13.8, FLOOR), (14.4, (5, -3.5, 1.6, 0.7, 1)),
                   (15.4, (5.35, -3.8, 2.2, 0.7, 1)), (16.5, IN_RIM)], 0.3, True)
    tilt.assert_axes(basin, {"basin": basin}, ASSEMBLIES)
    drain = plate((0.95, DRAIN_Z-0.95, DRAIN_Z+0.95), 13.9, 13.98, "drain")
    cap = plate((0.35, -0.35, 0.35), 0, 0.06, "overflow")
    cap.update(pivot=[0, 0, 0], rotation=[math.degrees(1.31), 0, 0])
    for key in ("origin", "pivot"):
        cap[key] = [cap[key][i]+(0, 15.9, 2.27)[i] for i in range(3)]
    tap = chrome_disc(0.55, TAP_BASE, TAP_BASE+0.25)
    tap.append(box((-0.3, 16.75, 3.2), (0.3, 19.7, 3.8), "chrome"))
    tap.extend(chrome_disc(0.42, 19.7, 19.94))
    spout = [(0, TAP_BASE+h, TAP_Z-d) for d, h in
             ((0, 1.72), (0.55, 1.84), (1.2, 1.84), (1.75, 1.68), (2.05, 1.36), (2.1, 0.8))]
    for i, (a, b) in enumerate(zip(spout, spout[1:])):
        segment = tube(a, b, 0.34, "chrome")
        # Internal end caps would intersect the neighbouring segment and stripe the chrome.
        segment["uv"]["down"] = face("clear")
        if i < len(spout)-2:
            segment["uv"]["up"] = face("clear")
        tap.append(segment)
    lever_path = [(0.2, LEVER_Y, TAP_Z), (0.9, LEVER_Y-0.1, TAP_Z), (1.4, LEVER_Y-0.28, TAP_Z)]
    lever = [tube(a, b, 0.16, "chrome") for a, b in zip(lever_path, lever_path[1:])]
    bones = [{"name": "root", "pivot": [0, 0, 0]}, bone("frame", frame), bone("drawer", drawer),
             bone("top", [top]), bone("basin", basin),
             bone("deck", [plate(DECK, 16.3, 16.5, "deck")]),
             bone("floor", [plate(FLOOR, 13.55, FLOOR_Y, "floor")]),
             bone("drain", [drain]), bone("overflow", [cap]), bone("tap", tap),
             bone("tap_lever", lever, pivot=(0, LEVER_Y, TAP_Z)),
             bone("stream", [box((-0.17, 14.3, 1.23), (0.17, 17.3, 1.57), "water")], pivot=(0, 14.3, 1.4)),
             bone("film", [plate((1.1, -2.8, 1), 13.82, 13.92, "water")], pivot=(0, 13.82, -0.9)),
             bone("foam", pivot=LANDING), bone("splash", pivot=LANDING)]
    for name, count, size in (("foam", FOAM_COUNT, (0.35, 0.12, 0.35)),
                              ("splash", SPLASH_COUNT, (0.25, 0.25, 0.25))):
        for i in range(count):
            bones.append(bone(f"{name}_{i}", [box(tuple(LANDING[j]-v/2 for j, v in enumerate(size)),
                                                 tuple(LANDING[j]+v/2 for j, v in enumerate(size)), "foam")],
                              parent=name, pivot=LANDING))
    # Preview and game coordinates mirror model x (ADR 0051); preserve the reference's handedness.
    for part in bones:
        part["pivot"][0] *= -1
        for cube in part.get("cubes", []):
            cube["origin"][0] = -cube["origin"][0]-cube["size"][0]
            if "pivot" in cube:
                cube["pivot"][0] *= -1
            if "rotation" in cube:
                cube["rotation"][1:] = [-v for v in cube["rotation"][1:]]
    validate(bones)
    return rounded({"format_version": "1.12.0", "minecraft:geometry": [{
        "description": {"identifier": "geometry.yasu_ride.washstand", "texture_width": ATLAS,
                        "texture_height": ATLAS, "visible_bounds_width": 2,
                        "visible_bounds_height": 2, "visible_bounds_offset": [0, 0.625, 0]},
        "bones": bones}]})


def validate(bones):
    opaque = [c for b in bones if b["name"] not in WATER_BONES and b.get("parent") not in WATER_BONES
              for c in b.get("cubes", [])]
    lo, hi = tilt.bounds([c for b in bones for c in b.get("cubes", [])])
    if any(a < b-1e-6 for a, b in zip(lo, (-8, 0, -5.25))) or any(
            a > b+1e-6 for a, b in zip(hi, (8, 20, 5.25))):
        raise ValueError(f"Washstand exceeds its bounds: {lo}, {hi}")
    basin = next(b["cubes"] for b in bones if b["name"] == "basin")
    tilt.assert_axes(opaque, {"basin": basin}, ASSEMBLIES)


def inside(x, z, shape):
    a, zf, zb, r, *_ = shape
    qx = max(abs(x)-(a-r), 0)
    qz = max(zf+r-z, z-(zb-r), 0)
    return abs(x) <= a and zf <= z <= zb and qx*qx+qz*qz <= r*r


def mix(stops, t):
    for (a, ca), (b, cb) in zip(stops, stops[1:]):
        if t <= b:
            f = max(0, (t-a)/(b-a))
            return tuple(round(x+(y-x)*f) for x, y in zip(ca, cb))
    return stops[-1][1]


def chrome_disc(radius, y0, y1):
    parts = panels.disc(radius, y0, y1, face("chrome"), bars=4, center=(0, TAP_Z))
    f = face("chrome")
    cap = {"uv": [f["uv"][0]+TILE//2, f["uv"][1]+TILE//2], "uv_size": [1, 1]}
    for part in parts:
        part["uv"]["up"] = cap
        part["uv"]["down"] = cap
    return parts


def tile_pixel(slot, u, v):
    x, z = (u+0.5)/TILE, (v+0.5)/TILE
    alpha = 255
    if slot in ("wood", "wood_top"):
        grain = 6*math.sin(v*2.1+math.sin(u/28)) + 3*math.sin(v*7.1+u/90)
        rgb = tuple(round(c+grain) for c in (212, 164, 108))
        if slot == "wood_top":
            px, pz = (x*2-1)*8, -5.25+z*10.5
            alpha = 255 if inside(px, pz, TOP) and not inside(px, pz, BOWL_OUT) else 0
    elif slot in ("deck", "floor"):
        shape = DECK if slot == "deck" else FLOOR
        px, pz = (x*2-1)*shape[0], shape[2]-z*(shape[2]-shape[1])
        alpha = 255 if inside(px, pz, shape) and not (slot == "deck" and inside(px, pz, IN_RIM)) else 0
        rgb = (245, 247, 247) if slot == "deck" else (230, 236, 238)
        if slot == "floor" and math.hypot(px, pz-DRAIN_Z) < 0.75:
            rgb = (13, 14, 15)
    elif slot == "shelf":
        # A complete diamond repeats 20 by 10 times across the shelf.
        a, b = x*20, z*10
        distance = min(abs((a+b) % 1-0.5), abs((a-b) % 1-0.5))
        rgb, alpha = (37, 40, 43), 255 if distance < 0.075 else 0
    elif slot in ("drain", "overflow"):
        dx, dz = x*2-1, z*2-1
        radius = math.hypot(dx, dz)
        alpha = 255 if radius <= 0.97 else 0
        if slot == "drain":
            rgb = mix(((0, (238, 241, 242)), (0.63, (191, 197, 201)),
                       (0.69, (123, 131, 136)), (0.72, (243, 246, 248)),
                       (0.93, (207, 213, 217)), (0.97, (142, 150, 155))), radius)
            holes = [(0, 0)] + [(0.36*math.cos(i*math.tau/6), 0.36*math.sin(i*math.tau/6)) for i in range(6)]
            if any(math.hypot(dx-hx, dz-hz) < 0.133 for hx, hz in holes):
                alpha = 0
        else:
            rgb = mix(((0, (255, 255, 255)), (0.45, (201, 207, 211)),
                       (0.8, (91, 98, 103)), (1, (42, 46, 49))), math.hypot(dx+0.28, dz+0.35)/1.4)
    elif slot == "foot":
        value = 26 + (8 if u % 8 < 3 else 0)
        rgb = (value, value+3, value+5)
    elif slot == "chrome":
        rgb = mix(CHROME, x)
        rgb = tuple(round(c+(255-c)*max(0, 0.35*(1-2*z))-c*max(0, 0.25*(2*z-1))) for c in rgb)
    else:
        rgb = {"steel": (38, 41, 44), "rod": (31, 34, 36), "porcelain": (245, 247, 247),
               "inner": (230, 236, 238), "clear": (212, 164, 108),
               "water": (158, 220, 255), "foam": (255, 255, 255)}[slot]
        alpha = 0 if slot in ("clear", "water", "foam") else 255
    return (*rgb, alpha)


def padded_tile(slot):
    pixels = [[tile_pixel(slot, u, v) for u in range(TILE)] for v in range(TILE)]
    if slot in ("clear", "water", "foam"):
        return pixels
    # Exact squared-distance padding keeps the nearest opaque RGB under every alpha-zero texel.
    rows = []
    for v in range(TILE):
        opaque = [u for u in range(TILE) if pixels[v][u][3]]
        rows.append([min(opaque, key=lambda a: (a-u)**2) if opaque else None for u in range(TILE)])
    for v in range(TILE):
        for u in range(TILE):
            if not pixels[v][u][3]:
                candidates = [(row, rows[row][u]) for row in range(TILE) if rows[row][u] is not None]
                row, col = min(candidates, key=lambda p: (p[0]-v)**2+(p[1]-u)**2)
                pixels[v][u] = (*pixels[row][col][:3], 0)
    return pixels


def animations():
    idle = {name: {"scale": [0, 0, 0]} for name in WATER_BONES}
    idle["tap_lever"] = {"rotation": [0, 0, 0]}
    run = {"tap_lever": {"rotation": {"0.0": [0, 0, 0], "0.15": [0, 0, LEVER_DEGREES],
                                     "4.7": [0, 0, LEVER_DEGREES], "5.0": [0, 0, 0]}}}
    envelope = {"0.0": [0, 0, 0], "0.15": [1, 1, 1], "4.7": [1, 1, 1], "5.0": [0, 0, 0]}
    for name in WATER_BONES:
        run[name] = {"scale": dict(envelope)}
    stream_scale = run["stream"]["scale"]
    for n in range(1, 100):
        t = n*0.05
        if t <= 0.15 or t >= 4.7:
            continue
        k = min(t/0.15, 1, max(0, (5-t)/0.3))
        w = (0.9+0.15*math.sin(t*40))*k
        stream_scale[f"{t:.2f}"] = [w, k, w]
    run["stream"]["scale"] = dict(sorted(stream_scale.items(), key=lambda item: float(item[0])))
    for i in range(FOAM_COUNT):
        position, scale = {}, {}
        phases = {t: (t/FLOW_PERIOD+i/FOAM_COUNT) % 1 for t in (0.0, RUN_SECONDS)}
        for cycle in range(-1, 6):
            for q in (0, 0.25, 0.9, 0.9999):
                t = (cycle+q-i/FOAM_COUNT)*FLOW_PERIOD
                if 0 < t < RUN_SECONDS:
                    phases[round(t, 6)] = q
        for t, q in sorted(phases.items()):
            if q < 0.25:
                y, z = 14.3-0.45*q/0.25, 1.45-0.55*q/0.25
            elif q < 0.9:
                y, z = 13.86, 0.9+(DRAIN_Z-0.9)*(q-0.25)/0.65
            else:
                y, z = 13.86-0.25*(q-0.9)/0.1, DRAIN_Z
            key = f"{t:.6f}"
            position[key] = [-0.25*math.sin(i*2.3+t*3), y-LANDING[1], z-LANDING[2]]
            scale[key] = [max(0, 1-(q-0.9)/0.1)]*3 if q > 0.9 else [1, 1, 1]
        run[f"foam_{i}"] = {"position": position, "scale": scale}
    for i in range(SPLASH_COUNT):
        position, scale = {}, {}
        angle = i*math.tau/SPLASH_COUNT
        phases = {t: (t*5+i/SPLASH_COUNT) % 1 for t in (0.0, RUN_SECONDS)}
        for cycle in range(-1, 27):
            for phase in (0, 0.25, 0.5, 0.75, 0.9999):
                t = (cycle+phase-i/SPLASH_COUNT)/5
                if 0 < t < RUN_SECONDS:
                    phases[round(t, 6)] = phase
        for t, phase in sorted(phases.items()):
            key = f"{t:.6f}"
            position[key] = [-math.cos(angle)*0.8*phase, math.sin(phase*math.pi),
                             math.sin(angle)*0.8*phase]
            scale[key] = [1-phase]*3
        run[f"splash_{i}"] = {"position": position, "scale": scale}
    return rounded({"format_version": "1.8.0", "animations": {
        "animation.yasu_ride.washstand.idle": {"loop": True, "bones": idle},
        "animation.yasu_ride.washstand.run": {"animation_length": RUN_SECONDS,
                                              "loop": "hold_on_last_frame", "bones": run}}})


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("resource_pack", type=Path)
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()
    out = texture_io.Outputs(args.check, report_writes=True)
    out.json(args.resource_pack / GEOMETRY, geometry())
    out.json(args.resource_pack / ANIMATION, animations())
    tiles = [padded_tile(slot) for slot in SLOTS]
    def pixel(x, y):
        if SHELF_U <= x < SHELF_U+SHELF_WIDTH and SHELF_V <= y < SHELF_V+SHELF_HEIGHT:
            a, b = (x-SHELF_U+0.5)/SHELF_WIDTH*20, (y-SHELF_V+0.5)/SHELF_HEIGHT*10
            distance = min(abs((a+b) % 1-0.5), abs((a-b) % 1-0.5))
            return (37, 40, 43, 255 if distance < 0.075 else 0)
        if x >= TILE*4 or y >= TILE*4:
            return (212, 164, 108, 0)
        index = y//TILE*4+x//TILE
        return tiles[index][y % TILE][x % TILE] if index < len(tiles) else (212, 164, 108, 0)
    out.png(args.resource_pack / TEXTURE, ATLAS, ATLAS, pixel, compress_level=9)
    def water(x, y):
        if x >= TILE*4 or y >= TILE*4:
            return (158, 220, 255, 0)
        index = y//TILE*4+x//TILE
        slot = SLOTS[index] if index < len(SLOTS) else "clear"
        return (158, 220, 255, 153) if slot == "water" else (255, 255, 255, 217) if slot == "foam" else (158, 220, 255, 0)
    out.png(args.resource_pack / WATER_TEXTURE, ATLAS, ATLAS, water, compress_level=9)
    out.finish("Washstand outputs are stale; run `pnpm model`:", "Washstand outputs are up to date")


if __name__ == "__main__":
    main()
