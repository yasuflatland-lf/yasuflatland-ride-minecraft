"""Shared camper dimensions, atlas allocations, and cube operations."""

import json
import math
from tool_loader import load_tool

camper_atlas = load_tool("camper_atlas")

PALETTE = {
    "white": (238, 235, 226, 255),
    "panel": (226, 222, 210, 255),
    "brown": (152, 98, 52, 255),
    "tan": (186, 140, 92, 255),
    "khaki": (150, 128, 72, 255),
    "steel": (172, 172, 166, 255),
    "stripe": (128, 98, 52, 255),
    "black": (24, 24, 24, 255),
    "tire": (34, 34, 36, 255),
    "rim": (230, 228, 220, 255),
    "chrome": (205, 206, 210, 255),
    "slat": (168, 170, 172, 255),
    "grille": (52, 54, 56, 255),
    "glass": (70, 92, 108, 110),
    "lens": (235, 235, 215, 255),
    "amber": (240, 140, 30, 255),
    "red": (200, 30, 30, 255),
    "dash": (78, 104, 52, 255),
    "dark_dash": (58, 80, 40, 255),
    "gauge": (20, 20, 20, 255),
    "seat": (150, 92, 50, 255),
    "wood": (176, 136, 92, 255),
    "wall_in": (196, 170, 128, 255),
    "curtain": (196, 120, 60, 255),
    "ivory": (232, 226, 204, 255),
    "dash_pad": (88, 118, 60, 255),
    "tweed": (104, 116, 58, 255),
    "tweed_line": (78, 88, 42, 255),
    "piping": (128, 140, 78, 255),
    "needle": (245, 245, 245, 255),
    "hub": (196, 192, 176, 255),
    "harvest": (214, 160, 48, 255),
    "avocado": (120, 132, 54, 255),
    # The ceiling light lenses: alpha 0, so the emissive material lights them fully while the
    # lights are on, and the plain entity material, which ignores alpha, shows them unlit (ADR 0020, 0115).
    "dome": (250, 244, 218, 0),
    # The roof clearance and tail lamps that glow with the headlights: the RGB of amber and red,
    # appended so no swatch index moves, while the side markers and turn signals keep the unlit
    # swatches (ADR 0184).
    "marker_amber": (240, 140, 30, 255),
    "marker_red": (200, 30, 30, 255),
    # Append trim swatches so every existing cube keeps its palette index.
    "aluminium": (168, 170, 168, 255),
    "trim_beige": (214, 211, 202, 255),
    "glow": (80, 170, 255, 40),
}
SLOTS = list(PALETTE)
ATLAS = camper_atlas.RegisteredAtlas(SLOTS)
RIB_PERIOD_TEXELS = 4
RIB_TEXELS_PER_PX = 2
BOLT_PITCH_PX = 6
# Each bone name maps to the palette swatches whose cubes form it so the render controller can light them.
LAMP_GROUPS = {
    "headlights": ("lens", "marker_amber", "marker_red"),
    "ceiling_lights": ("dome",),
}
LIT_SLOTS = tuple(dict.fromkeys(SLOTS.index(name) for names in LAMP_GROUPS.values() for name in names)) + (SLOTS.index("glow"),)


HW = 24  # half width
FRONT, REAR = -56, 56
BOTTOM, FLOOR, CEIL, ROOF = 8, 16, 61, 64  # roof 4.0 blocks up, the top of the fourth cell from the ground
# Row dy maps to height ROOF - dy / RIB_TEXELS_PER_PX; side UVs start at the cube's top,
# keeping one rib phase across cubes.
RIB_REGION = ATLAS.allocate("rib", 8, ROOF * RIB_TEXELS_PER_PX)
DOOR_HEAD_REGION = ATLAS.allocate("door_head", 18, 3)
DOOR_HINGE_REGION = ATLAS.allocate("door_hinge", 3, 26)
DOOR_LATCH_REGION = ATLAS.allocate("door_latch", 3, 26)
VENT_SCREWS_REGION = ATLAS.allocate("vent_screws", 16, 3)
HARDWARE_DARK_FACTOR = 0.65
FRONT_AXLE, REAR_AXLE = -31.5, 31
WHEEL_R = 7.8
GLOW_RADIUS = WHEEL_R
GLOW_SEGMENTS = 16
GLOW_BOTTOM = -0.5
# Keep the existing 2.5 px end gaps and 2 px top gap; scaling the gaps crowds the rear hatch.
ARCH_HALF = WHEEL_R + 2.5
ARCH_TOP, ARCH_SLOPE_Y, ARCH_INSET, ARCH_STEP = 2 * WHEEL_R + 2, 10.8, 4.2, 0.25
ARCHES = [(FRONT_AXLE - ARCH_HALF, FRONT_AXLE + ARCH_HALF), (REAR_AXLE - ARCH_HALF, REAR_AXLE + ARCH_HALF)]
WATER_FILL_Z, WATER_FILL_Y = 14, 14.1
DOOR = (-7, 7, 12, 54)  # z0, z1, y0, y1 on the right side; local cell z = 0
# The sides end at the footprint's edge (REAR = 56) and the rear profile (rear_z) never comes
# closer than 56.5, so a block or chest in the last row never shows through the back. The
# rear wall's rows are 1 px deep behind the profile, though, so where the profile is under
# 57 they start inside the last cell row: from 55.5 in the window band (y 37 to 52) and up
# to y 53.5, where the top lean has not yet reached 57. A block there overlaps the wall.
REAR_INNER = REAR


def box(x0, y0, z0, x1, y1, z1, color, rotation=None, pivot=None, offset=(0, 0), uv_size=None):
    c = {
        "origin": [round(min(x0, x1), 3), round(min(y0, y1), 3), round(min(z0, z1), 3)],
        "size": [round(abs(x1 - x0), 3), round(abs(y1 - y0), 3), round(abs(z1 - z0), 3)],
        "uv": {f: ATLAS.face(color, offset, uv_size) for f in ("north", "south", "east", "west", "up", "down")},
    }
    if rotation:
        c["rotation"] = rotation
        c["pivot"] = pivot
    return c


def rib_sides(cubes):
    for c in cubes:
        if c["uv"]["north"] != ATLAS.face("white"):
            continue
        x0, y0, _ = c["origin"]
        width, height, _ = c["size"]
        for face, edge in (("west", x0), ("east", x0 + width)):
            if abs(edge) == HW:
                # Ribs are uniform along u; the full region width also fits long wall faces.
                c["uv"][face] = ATLAS.face(RIB_REGION, (0, round((ROOF - (y0 + height)) * RIB_TEXELS_PER_PX, 3)),
                                          (RIB_REGION.w, height * RIB_TEXELS_PER_PX))
    return cubes


def take_slots(cubes, names):
    slots = {SLOTS.index(n) for n in names}
    taken, rest = [], []
    for c in cubes:
        if ATLAS.atlas_swatch_at(*c["uv"]["north"]["uv"]) in slots:
            taken.append(c)
        else:
            rest.append(c)
    return taken, rest


def panel(axis, p0, p1, u0, u1, v0, v1, holes, color):
    """A flat panel minus rectangular holes. axis 'x': u = z, v = y; axis 'z': u = x, v = y."""
    breaks = sorted({v0, v1, *[h[2] for h in holes], *[h[3] for h in holes]})
    breaks = [b for b in breaks if v0 <= b <= v1]
    out = []
    for a, b in zip(breaks, breaks[1:]):
        cuts = sorted((h[0], h[1]) for h in holes if h[2] <= a and h[3] >= b)
        u = u0
        for c0, c1 in cuts + [(u1, u1)]:
            if c0 > u:
                if axis == "x":
                    out.append(box(p0, a, u, p1, b, c0, color))
                else:
                    out.append(box(u, a, p0, c0, b, p1, color))
            u = max(u, c1)
    return out


STEPS_32 = tuple(i * 11.25 for i in range(16))
STEPS_16 = tuple(i * 22.5 for i in range(8))
STEPS_8 = tuple(i * 45.0 for i in range(4))


def disc(axis, cx, cy, cz, r, depth, color, steps=STEPS_32, square=False):
    """A disc of 2 * len(steps) sides (32 with the default steps) from bars turned about its
    normal: 'x' (wheels), 'y' (the stove burner), or 'z' (lamps).
    square=True uses turned squares with corner radius r for hover glows."""
    n = 2 * len(steps)
    long, short = 2 * r, 2 * r * math.tan(math.pi / n)
    if square:
        long = short = math.sqrt(2) * r
    out = []
    for a in steps:
        if axis == "x":
            out.append(box(cx, cy - short / 2, cz - long / 2, cx + depth, cy + short / 2, cz + long / 2, color, [a, 0, 0], [cx, cy, cz]))
        elif axis == "y":
            out.append(box(cx - long / 2, cy, cz - short / 2, cx + long / 2, cy + depth, cz + short / 2, color, [0, a, 0], [cx, cy, cz]))
        else:
            out.append(box(cx - long / 2, cy - short / 2, cz, cx + long / 2, cy + short / 2, cz + depth, color, [0, 0, a], [cx, cy, cz]))
    return out


def shift_in_slices(cube, cuts, dz_at):
    """Copies of cube cut at the y values in cuts, each moved along z by dz_at(its middle y)."""
    pieces = []
    for a0, a1 in zip(cuts, cuts[1:]):
        dz = dz_at((a0 + a1) / 2)
        piece = json.loads(json.dumps(cube))
        piece["origin"] = [cube["origin"][0], round(a0, 3), round(cube["origin"][2] + dz, 3)]
        piece["size"] = [cube["size"][0], round(a1 - a0, 3), cube["size"][2]]
        if "pivot" in piece:
            piece["pivot"] = [piece["pivot"][0], piece["pivot"][1], round(piece["pivot"][2] + dz, 3)]
        pieces.append(piece)
    return pieces


WIN_Y = (36, 49)
VENT_COVER = (40.5, 49.5, 36.5, 48.5)
VENT_RIM, VENT_CORNER = 0.7, 0.35
VENT_SLITS, VENT_SLIT, VENT_SLIT_PITCH = 12, 0.25, 0.6
VENT_SLIT_MARGIN, VENT_SLIT_GAP = 0.5, 0.8
BAND_Y = (34.5, 50.5)
STRIPE_Y = (29.5, 31.5)
# The rear seen from the side, from the rear-corner photo: the top leans out to the roof
# edge, the window band sits back, and the body below it steps out again and leans in
# toward the bottom.
REAR_TOP_LEAN, REAR_BAND_Y, REAR_BAND_DEPTH = (52, 4.5), (37, 52), 4.5
REAR_LOW_STEP, REAR_LOW_LEAN = 1.0, 1.7


REAR_OUT = REAR + REAR_BAND_DEPTH + 0.5  # the roof edge, the rearmost point of the body


def rear_z(y):
    """The rear surface at height y."""
    y = max(y, BOTTOM)  # the bumper follows the bottom of the body
    if y >= REAR_BAND_Y[1]:
        return REAR_OUT - REAR_BAND_DEPTH * (ROOF - y) / (ROOF - REAR_BAND_Y[1])
    if y >= REAR_BAND_Y[0]:
        return REAR_OUT - REAR_BAND_DEPTH
    return REAR_OUT - REAR_LOW_STEP - REAR_LOW_LEAN * (REAR_BAND_Y[0] - y) / (REAR_BAND_Y[0] - BOTTOM)


CAB_WIN = (-50, -38, 35, 50)
SIDE0 = FRONT + 3
# The window over the counter is as long as the one ahead of the door and centered between
# the door and the rear window, so the stove and the sink look out (ADR 0113).
right_windows = [CAB_WIN, (-35, -10, *WIN_Y), (10, 35, *WIN_Y), (-31, -19, 56, 59)]
left_windows = [CAB_WIN, (-29, -5, *WIN_Y), (-19, -8, 56, 59), (16, 21, *WIN_Y), (40, 49, *WIN_Y)]
WS_Z = FRONT + 2.5  # The windshield sits behind a ledge over the grille.
TOP_FRONT = WS_Z + 0.5
BOLT_REGION = ATLAS.allocate("bolt", math.ceil(REAR_OUT - TOP_FRONT), 1)
# A polished-plate tile: the mirror parts' every face maps onto it, thin parts onto its corner.
MIRROR_CHROME_REGION = ATLAS.allocate("mirror_chrome", 16, 32)
MIRROR_THIN_UV = (4, 8)
FURN_X = (9, 22.4)  # leaves the aisle (x < 8) clear


def moved(cube, offset):
    """A copy of cube with its origin and pivot moved by offset."""
    copy = dict(cube)
    copy["origin"] = [v + d for v, d in zip(cube["origin"], offset)]
    if "pivot" in cube:
        copy["pivot"] = [v + d for v, d in zip(cube["pivot"], offset)]
    return copy


def carve(cube, hole):
    """Pieces of an unrotated cube outside the box hole = (x0, y0, z0, x1, y1, z1)."""
    lo = cube["origin"]
    hi = [o + d for o, d in zip(lo, cube["size"])]
    if "rotation" in cube or any(hi[i] <= hole[i] or lo[i] >= hole[i + 3] for i in range(3)):
        return [cube]
    pieces, a, b = [], list(lo), list(hi)
    for axis in range(3):
        if a[axis] < hole[axis]:
            pieces.append((list(a), [*b[:axis], hole[axis], *b[axis + 1:]]))
            a[axis] = hole[axis]
        if b[axis] > hole[axis + 3]:
            pieces.append(([*a[:axis], hole[axis + 3], *a[axis + 1:]], list(b)))
            b[axis] = hole[axis + 3]
    out = []
    for p0, p1 in pieces:
        piece = json.loads(json.dumps(cube))
        piece["origin"] = [round(v, 3) for v in p0]
        piece["size"] = [round(v1 - v0, 3) for v0, v1 in zip(p0, p1)]
        out.append(piece)
    return out



class AreaCubes(dict):
    """Bone cube lists, concatenated without changing bone insertion order."""

    def merge(self, other: "AreaCubes") -> "AreaCubes":
        for bone, cubes in other.items():
            self.setdefault(bone, []).extend(cubes)
        return self


def window_glass(x0, window):
    z0, z1, y0, y1 = window
    return box(x0 + 0.4, y0, z0, x0 + 0.6, y1, z1, "glass")


def wheel_positions():
    for end, z in (("f", FRONT_AXLE), ("r", REAR_AXLE)):
        for sx in (1, -1):
            name = end + ("l" if sx < 0 else "r")
            yield name, sx, sx * (HW - 0.6 - 2), z


def scale(color, factor):
    return tuple(max(0, min(255, math.floor(c * factor + 0.5))) for c in color)


# Baked streaks for devices without PBR, as on the owner's photo of the plated housing: the sky's
# light from the top, a dark horizon, the ground's warmer light below, and narrow dark reflections.
MIRROR_STREAKS = (0.9, 1.0, 1.0, 0.45, 0.8, 1.0, 0.95, 0.35, 0.6, 1.0, 1.0, 0.85, 0.4, 0.95, 1.0, 0.75)
MIRROR_SKY, MIRROR_GROUND = (236, 244, 252), (250, 240, 224)
MIRROR_HORIZON = (58, 62, 70)


def mirror_chrome_pixel(x, y):
    wobble = round(math.sin(y * 0.45) * 1.2)
    streak = MIRROR_STREAKS[(x + wobble) % len(MIRROR_STREAKS)]
    light = MIRROR_SKY if y < 19 else MIRROR_GROUND
    fade = 0.72 + 0.28 * abs(y - 19) / 19
    if y in (18, 19):
        return (*MIRROR_HORIZON, 255)
    return (*scale(light, streak * fade), 255)


def region_pixel(region, x, y):
    if region.name == "burner_cast":
        return PALETTE["tire" if (x, y) in BURNER_CAST_DOTS else "grille"]
    if region.name == "mirror_chrome":
        return mirror_chrome_pixel(x, y)
    if region.name == "rib":
        phase = y % RIB_PERIOD_TEXELS
        factor = 0.93 if phase == 0 else 1.05 if phase == 1 else 1
        return (*scale(PALETTE["white"][:3], factor), 255)
    if region.name == "bolt":
        dark = x % BOLT_PITCH_PX == 0
    elif region.name == "door_head":
        dark = y == region.h - 1
    elif region.name == "door_hinge":
        dark = y in (5, 6, 19, 20)
    elif region.name == "door_latch":
        dark = x == 1 and y in (10, 11)
    elif region.name == "vent_screws":
        dark = y == 1 and x in (2, 7, 12)
    else:
        raise ValueError(f"Unknown camper region: {region.name}")
    return (*scale(PALETTE["aluminium"][:3], HARDWARE_DARK_FACTOR if dark else 1), 255)


BURNER_CAST_REGION = ATLAS.allocate("burner_cast", 8, 8)
BURNER_CAST_DOTS = ((2, 3), (6, 5))
def wheel_holes() -> list[tuple]:
    arch_holes = []
    for a0, a1 in ARCHES:  # straight up to ARCH_SLOPE_Y, then sloping in by ARCH_INSET in fine steps
        arch_holes.append((a0, a1, 0, ARCH_SLOPE_Y))
        n = round((ARCH_TOP - ARCH_SLOPE_Y) / ARCH_STEP)
        for i in range(n):
            inset = ARCH_INSET * (i + 0.5) / n
            y = ARCH_SLOPE_Y + i * ARCH_STEP
            arch_holes.append((a0 + inset, a1 - inset, y, y + ARCH_STEP))
    return arch_holes


def side_holes(windows: list, right: bool) -> list:
    return windows + wheel_holes() + [(SIDE0, -50.5, 35.4, 52)] + ([DOOR] if right else [])


def surface_geometry() -> list[dict]:
    cubes = [box(-HW + 1, 13, FRONT + 1, HW - 1, FLOOR, REAR_INNER, "wood")]
    for inner, windows, right in ((HW - 1.2, right_windows, True), (-HW + 1, left_windows, False)):
        cubes += panel("x", inner, inner + 0.2, FRONT + 8, REAR_INNER, FLOOR, CEIL - 0.2,
                       side_holes(windows, right), "wall_in")
    return cubes


def wheel_well_holes():
    """Wheel-well cuts applied to the merged floor and furniture before adding panels."""
    for sgn in (1, -1):
        for a0, a1 in ARCHES:
            x_room, x_wall = (sgn * (HW - d) for d in (5.7, 1))
            yield (min(x_room, x_wall), -99, a0 - 0.3, max(x_room, x_wall), ARCH_TOP + 0.8, a1 + 0.3)


regions = load_tool("camper_regions")
assert WIN_Y == regions.CURTAIN_WINDOW_Y, "curtain geometry is baked for another window height"
REGISTRY = regions.RegionRegistry()
BASE_REF = REGISTRY.register(regions.Region(
    "base", ATLAS.width, ATLAS.height, regions.Material.SWATCHES_MIXED,
    lambda x, y: ATLAS.pixel(PALETTE, x, y, region_pixel)))
load_tool("camper_seat_textures").register(REGISTRY)
kitchen = load_tool("camper_kitchen")


def register_kitchen_materials(registry):
    """Reserve shared kitchen materials before either area's faces are emitted."""
    refs = kitchen.register_kitchen(registry)
    load_tool("camper_kitchen_fronts").register_panel(registry)
    return refs


KITCHEN_REGIONS = kitchen.register_kitchen(REGISTRY)
load_tool("camper_surfaces").register_surfaces(REGISTRY)
CURTAIN_REF = REGISTRY.register(regions.Region(
    "light curtain fabric", 96, 120, regions.Material.FABRIC, regions.curtain_pixel))
DOOR_REFS = load_tool("camper_door_materials").register(REGISTRY, PALETTE)
ATLAS.base_ref = BASE_REF

AREA_ORDER = (
    "shell", "surfaces", "curtains", "door", "front", "rear", "roof", "running", "cab", "cab_seats",
    "bed_bunk", "fridge", "kitchen", "kitchen_fronts", "room", "shower", "ceiling", "dinette", "arches",
)


def prepare_layout():
    """Register area materials before any geometry resolves the shared atlas."""
    if REGISTRY._layout is None:
        for name in AREA_ORDER:
            module = load_tool(f"camper_{name}")
            register = getattr(module, "register_regions", None)
            if register is not None:
                register(REGISTRY)
        regions.pack(REGISTRY)
    return REGISTRY._layout


def __getattr__(name):
    if name == "LAYOUT":
        return prepare_layout()
    raise AttributeError(name)


ATLAS.prepare = prepare_layout
