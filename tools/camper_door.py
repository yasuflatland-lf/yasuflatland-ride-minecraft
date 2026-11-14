"""Build the camper door area."""

import math
from tool_loader import load_tool

kit = load_tool("camper_kit")
ATLAS = kit.ATLAS
AreaCubes = kit.AreaCubes
BAND_Y = kit.BAND_Y
DOOR = kit.DOOR
DOOR_HEAD_REGION = kit.DOOR_HEAD_REGION
DOOR_HINGE_REGION = kit.DOOR_HINGE_REGION
DOOR_LATCH_REGION = kit.DOOR_LATCH_REGION
HW = kit.HW
STRIPE_Y = kit.STRIPE_Y
WIN_Y = kit.WIN_Y
box = kit.box
rib_sides = kit.rib_sides

AREA = "door"


DZ0, DZ1, DY0, DY1 = DOOR
DOOR_HINGE = [HW, 0, DZ0]


def _build_exterior() -> AreaCubes:
    body = []
    DOOR_HANDLE_Y = (STRIPE_Y[0] - 1.5, STRIPE_Y[0] - 0.5)  # half a pixel below the stripe (ADR 0145)
    door = rib_sides([box(HW - 1, DY0, DZ0 + 0.1, HW, DY1, DZ1 - 0.1, "white")])
    # The door window lines up with the side windows, as on the close-up photo.
    DW0, DW1 = DZ0 + 3, DZ1 - 3
    door.append(box(HW, WIN_Y[0], DW0, HW + 0.15, WIN_Y[1], DW1, "glass"))
    for fz0, fz1, fy0, fy1, hardware in ((DW0 - 0.6, DW1 + 0.6, WIN_Y[0] - 0.6, WIN_Y[0], None),
                                         (DW0 - 0.6, DW1 + 0.6, WIN_Y[1], WIN_Y[1] + 0.6, DOOR_HEAD_REGION),
                                         (DW0 - 0.6, DW0, *WIN_Y, DOOR_HINGE_REGION),
                                         (DW1, DW1 + 0.6, *WIN_Y, DOOR_LATCH_REGION)):
        door_frame = box(HW, fy0, fz0, HW + 0.18, fy1, fz1, "aluminium")
        if hardware is not None:
            # The build's +x face is named east; mirror_x swaps it to the outward west face.
            door_frame["uv"]["east"] = ATLAS.face(hardware)
        door.append(door_frame)
    door.append(box(HW, STRIPE_Y[0], DZ0 + 0.1, HW + 0.12, STRIPE_Y[1], DZ1 - 0.1, "stripe"))
    door.append(box(HW, BAND_Y[0], DZ0 + 0.1, HW + 0.1, BAND_Y[1], DZ1 - 0.1, "khaki"))
    door.append(box(HW, DY0, DZ0 + 0.1, HW + 0.12, 15, DZ1 - 0.1, "tan"))
    door.append(box(HW, DOOR_HANDLE_Y[0], DZ1 - 2.5, HW + 0.6, DOOR_HANDLE_Y[1], DZ1 - 1, "chrome"))  # handle outside
    door.append(box(HW - 1.6, DOOR_HANDLE_Y[0], DZ1 - 2.5, HW - 1, DOOR_HANDLE_Y[1], DZ1 - 1, "chrome"))  # handle inside
    # The latch plate at the door's rear edge: a square of aluminium with a dark recess behind the handle.
    door.append(box(HW + 0.12, 27.7, DZ1 - 2.5, HW + 0.3, 30.4, DZ1 - 0.15, "aluminium"))
    door.append(box(HW + 0.3, 27.9, DZ1 - 2.2, HW + 0.32, 29.7, DZ1 - 1.2, "grille"))
    for rivet_z in (DZ1 - 2.25, DZ1 - 0.4):
        for rivet_y in (27.95, 30.15):
            door.append(box(HW + 0.3, rivet_y - 0.09, rivet_z - 0.09, HW + 0.33, rivet_y + 0.09, rivet_z + 0.09, "slat"))
    # The photo's window has rounded corners; level rows fill them inside the square frame.
    WINDOW_CORNER = 1.0
    for i in range(4):
        dy = (i + 0.5) * WINDOW_CORNER / 4
        inset = WINDOW_CORNER - math.sqrt(WINDOW_CORNER ** 2 - (WINDOW_CORNER - dy) ** 2)
        for row_y in (WIN_Y[0] + i * WINDOW_CORNER / 4, WIN_Y[1] - (i + 1) * WINDOW_CORNER / 4):
            for z0, z1 in ((DW0, DW0 + inset), (DW1 - inset, DW1)):
                door.append(box(HW, row_y, z0, HW + 0.18, row_y + WINDOW_CORNER / 4, z1, "aluminium"))


    def door_rivets(y, z0, z1, x, count):
        return [box(x, y - 0.09, z - 0.09, x + 0.03, y + 0.09, z + 0.09, "slat")
                for z in (z0 + (z1 - z0) * (i + 0.5) / count for i in range(count))]


    def door_trim():
        """The fixed aluminium door surround, measured on the owner's photo at 16.8 px per px of width
        and 19.4 per px of height: each strip has a bright edge and a dark seam so it reads as metal."""
        FACE = HW + 0.14  # clears the door's painted skins, whose edges the strips overlap
        BOTTOM_Y, TOP_Y = 8.7, 54.6
        REAR_Z, HINGE_Z = DZ1 + 0.8, DZ0 - 1.8
        parts = []
        # Latch side: one strip whose lip covers the gap around the door.
        parts.append(box(FACE, BOTTOM_Y, DZ1 - 0.15, FACE + 0.14, TOP_Y, REAR_Z, "aluminium"))
        parts.append(box(FACE + 0.14, BOTTOM_Y, DZ1 - 0.15, FACE + 0.17, TOP_Y, DZ1 + 0.05, "chrome"))
        # Hinge side: two strips with a dark seam between them, as on the photo.
        parts.append(box(FACE, BOTTOM_Y, DZ0 - 0.85, FACE + 0.14, TOP_Y, DZ0 + 0.15, "aluminium"))
        parts.append(box(HW, BOTTOM_Y, DZ0 - 0.95, FACE + 0.06, TOP_Y, DZ0 - 0.85, "grille"))
        parts.append(box(HW, BOTTOM_Y, HINGE_Z, FACE + 0.18, TOP_Y, DZ0 - 0.95, "aluminium"))
        parts.append(box(FACE + 0.18, BOTTOM_Y, HINGE_Z, FACE + 0.21, TOP_Y, HINGE_Z + 0.15, "chrome"))
        # Threshold plate under the door, riveted along its length.
        parts.append(box(FACE, 9.2, DZ0 + 0.15, FACE + 0.12, 10.7, DZ1 - 0.15, "aluminium"))
        parts.append(box(FACE, BOTTOM_Y, DZ0 + 0.15, FACE + 0.16, 9.2, DZ1 - 0.15, "chrome"))
        parts += door_rivets(9.95, DZ0 + 0.15, DZ1 - 0.15, FACE + 0.12, 8)
        # Head: an inner rail over the door and a riveted drip cap past both jambs, its top standing out.
        parts.append(box(FACE, DY1 - 0.05, DZ0 + 0.15, FACE + 0.16, TOP_Y, DZ1 - 0.15, "aluminium"))
        parts.append(box(HW, TOP_Y, HINGE_Z - 0.2, FACE + 0.3, TOP_Y + 0.9, REAR_Z + 0.2, "aluminium"))
        parts.append(box(HW, TOP_Y + 0.9, HINGE_Z - 0.2, FACE + 0.5, TOP_Y + 1.5, REAR_Z + 0.2, "chrome"))
        parts += door_rivets(TOP_Y + 1.2, HINGE_Z, REAR_Z, FACE + 0.5, 10)
        # Three hinges: a bright leaf on the inner strip and dark knuckle ends on the seam.
        for y in (13.3, 32.1, 51.5):
            parts.append(box(FACE + 0.14, y - 1.1, DZ0 - 0.8, FACE + 0.22, y + 1.1, DZ0 + 0.1, "chrome"))
            for knuckle in (y - 1.4, y + 0.9):
                parts.append(box(HW, knuckle, DZ0 - 1.25, FACE + 0.3, knuckle + 0.5, DZ0 - 0.65, "grille"))
        # The small catch low on the latch side.
        parts.append(box(FACE + 0.14, 16.65, DZ1 + 0.1, FACE + 0.26, 18.95, DZ1 + 0.6, "chrome"))
        return parts


    def fold_out_step():
        """Thin black panels like a dustpan: a tread on two slanted side plates, open at the back as on
        the photo, with a thin rod between the plates under the body."""
        REACH = 6
        TREAD_Y, TOP_Y = 3.5, 8
        TREAD_Z0, TREAD_Z1 = DZ0 + 1, DZ1 - 1
        SLANT = 0.2  # both side plates move toward the rear going up, 0.85 px over their height on the photo
        THICK, ROW = 0.3, 0.25
        parts = [box(HW + 0.2, TREAD_Y, TREAD_Z0, HW + REACH, TREAD_Y + THICK, TREAD_Z1, "black")]
        # A short front lip keeps the tread from reading as a flat sheet.
        parts.append(box(HW + REACH - THICK, TREAD_Y + THICK, TREAD_Z0, HW + REACH, TREAD_Y + 0.8, TREAD_Z1, "black"))
        for i in range(4):
            x = HW + 1.2 + i
            parts.append(box(x, TREAD_Y + THICK, TREAD_Z0 + 1, x + 0.4, TREAD_Y + THICK + 0.04, TREAD_Z1 - 1, "grille"))
        rows = round((TOP_Y - TREAD_Y - THICK) / ROW)
        for i in range(rows):
            y0 = TREAD_Y + THICK + i * ROW
            dz = SLANT * (y0 + ROW / 2 - TREAD_Y)
            reach = REACH * (1 - (i + 0.5) / rows)
            for z in (TREAD_Z0 + dz, TREAD_Z1 - THICK + dz):
                parts.append(box(HW + 0.2, y0, z, HW + max(reach, 0.6), y0 + ROW, z + THICK, "black"))
        parts.append(box(HW + 0.5, 7.1, TREAD_Z0 + 0.6, HW + 0.7, 7.3, TREAD_Z1 + 0.6, "slat"))
        return parts


    body += door_trim() + fold_out_step()


    return AreaCubes({'body': body, 'door_entry': door})


RegionRegistry = kit.regions.RegionRegistry
TEXELS_PER_PX = load_tool("camper_door_materials").TEXELS_PER_PX
WOOD_HEIGHT = load_tool("camper_door_materials").WOOD_HEIGHT
INNER_FIELDS = ((12, 36, -6.9, 6.9), (49, 54, -6.9, 6.9),
                (36, 49, -6.9, -4), (36, 49, 4, 6.9))
CURTAIN_HEIGHTS = (36.2, 37.35, 38.5, 39.65, 40.8, 41.95, 43.1, 44.25, 45.4, 47.1, 48.85)
CURTAIN_FOLDS = 8


def _face(registry: RegionRegistry, name: str, u: float, v: float,
          width: float, height: float) -> dict:
    region = next(r for r in registry.regions() if r.name == name)
    ref = kit.regions.RegionRef(registry, region)
    face = {"uv": list(ref.uv(u, v)), "uv_size": [width, height]}
    registry._layout.bind_face(name, face)
    return face


def _curtain_width(y: float) -> float:
    waist, upper_span, lower_span = 40.8, 8.05, 4.6
    return .42 + (1.55 * ((y - waist) / upper_span) ** .85 if y >= waist
                  else .95 * ((waist - y) / lower_span) ** .85)


def build_door_entry(registry: RegionRegistry) -> AreaCubes:
    """Build in +x coordinates; the generator mirrors the complete assembly once."""
    door = _build_exterior()["door_entry"]
    # Keep the outward rib face fixed while recessing the opaque backing.
    door[0]["origin"][0] = HW - .2
    door[0]["size"][0] = .2

    def add(x0: float, y0: float, z0: float, x1: float, y1: float, z1: float,
            color: str = "aluminium", region: str | None = None) -> dict:
        # Measurements use the final -x door face; invert here before the common mirror.
        cube = box(-x1, y0, z0, -x0, y1, z1, color)
        # Keep full precision until serialization, particularly for rotated pleats.
        cube["origin"] = [-x1, y0, z0]
        cube["size"] = [x1 - x0, y1 - y0, z1 - z0]
        if region:
            name = "door " + region
            r = next(r for r in registry.regions() if r.name == name)
            u, v, w, h = 0, 0, r.width, r.height
            if region == "wood":
                u, v = (z0 + 6.9) * TEXELS_PER_PX, (DY1 - y1) * TEXELS_PER_PX
                w, h = (z1 - z0) * TEXELS_PER_PX, (y1 - y0) * TEXELS_PER_PX
            cube["uv"]["west"] = _face(registry, name, u, v, w, h)
        door.append(cube)
        return cube

    for y0, y1, z0, z1 in INNER_FIELDS:
        add(-23.8, y0, z0, -23.34, y1, z1, "wood", "wood")
    add(-23.8, 36, -4, -23.78, 49, 4, "grille")
    for y0, y1, color in ((39.3, 39.43, "slat"), (39.46, 39.51, "chrome")):
        add(-23.77, y0, -3.95, -23.75, y1, 3.95, color)
    for z0, z1 in ((-6.9, -6.48), (6.48, 6.9)):
        add(-23.8, 12, z0, -23.02, 54, z1)
        add(-23.02, 12, z0 + .07, -23.005, 54, z0 + .15, "chrome")
    for y0, y1 in ((12, 12.42), (53.58, 54)):
        add(-23.8, y0, -6.48, -23.02, y1, 6.48)
        add(-23.02, y1 - .1, -6.48, -23.005, y1 - .04, 6.48, "chrome")
    for y0, y1, z0, z1 in ((35.65, 36, -4.35, 4.35), (49, 49.35, -4.35, 4.35),
                           (36, 49, -4.35, -4), (36, 49, 4, 4.35)):
        add(-23.77, y0, z0, -23.12, y1, z1)
        add(-23.12, y0, z0, -23.07, min(y1, y0 + .08), z1, "chrome")
    rail_y = DY0 + (DY1 - DY0) * .55
    add(-23.34, rail_y - .17, -6.48, -23.04, rail_y + .17, 6.48)
    add(-23.04, rail_y + .07, -6.48, -23.01, rail_y + .15, 6.48, "chrome")
    add(-23.34, 29.8, -6.35, -23.22, 34.9, 6.35, "panel", "marble")
    for y in (29.68, 34.9):
        add(-23.24, y, -6.4, -23.09, y + .13, 6.4, "chrome")
    add(-23.22, 27.5, 4.18, -23.04, 33.2, 6.35)
    add(-23.04, 30.7, 4.62, -23.015, 31.7, 5.9, "khaki")
    add(-23.015, 31, 4.83, -23.001, 31.37, 5.66, "harvest")
    add(-23.04, 28, 4.5, -23.001, 29, 6, "khaki")
    for y in (27.76, 32.94):
        for z in (4.4, 6.12):
            add(-23.04, y - .055, z - .055, -23.005, y + .055, z + .055, "chrome")
    add(-23.34, 12.45, -6.3, -23.15, 17.85, 6.3, "aluminium", "kick")
    for y in (12.45, 17.85):
        add(-23.15, y, -6.35, -23.06, y + .13, 6.35, "chrome")
    for y in (13.3, 32.1, 51.5):
        add(-23.02, y - .65, -6.42, -23.001, y + .65, -5.96, "steel")
        for yy in (y - .43, y + .43):
            add(-23.001, yy - .045, -6.22, -23, yy + .045, -6.13, "chrome")
    add(-23.02, 27.6, 6.37, -23.001, 30.8, 6.47, "grille")
    for sign in (-1, 1):
        for ya, yb in zip(CURTAIN_HEIGHTS, CURTAIN_HEIGHTS[1:]):
            for j in range(CURTAIN_FOLDS):
                ym = (ya + yb) / 2
                za = sign * (3.85 - (j + .5) * _curtain_width(ya) / CURTAIN_FOLDS)
                zb = sign * (3.85 - (j + .5) * _curtain_width(yb) / CURTAIN_FOLDS)
                z, dy, dz = (za + zb) / 2, yb - ya, zb - za
                x = -23.37 + .14 * math.cos(j * math.pi)
                breadth = _curtain_width(ym) / CURTAIN_FOLDS * 1.45
                half_height = math.hypot(dy, dz) / 2
                cube = add(x - .035, ym - half_height, z - breadth / 2,
                           x + .035, ym + half_height, z + breadth / 2, "ivory", "cloth")
                cube["pivot"] = [-x, ym, z]
                cube["rotation"] = [-math.degrees(math.atan2(dz, dy)), 0, 0]
        add(-23.17, 40.64, sign * 3.61 - .34, -23.06, 40.96, sign * 3.61 + .34, "ivory")
    add(-23.27, 48.9, -3.96, -23.1, 49, 3.96, "chrome")
    return AreaCubes({"door_entry": door})


def build_shower_door(registry: RegionRegistry) -> AreaCubes:
    panel = box(8, kit.FLOOR + .5, 42.1, 8.6, 51.9, 53.9, "wood")
    width, height, depth = panel["size"]
    scale = TEXELS_PER_PX
    v = (WOOD_HEIGHT - height) * scale
    for side in ("east", "west"):
        # The final west face reverses u after the generator mirrors the building frame.
        reverse = side == "east"
        panel["uv"][side] = _face(registry, "door wood", depth * scale if reverse else 0,
                                  v, depth * scale * (-1 if reverse else 1), height * scale)
    for side in ("north", "south", "up", "down"):
        panel["uv"][side] = _face(registry, "door wood", 0, v, width * scale,
                                  (height if side in ("north", "south") else depth) * scale)
    return AreaCubes({"shower_door": [panel,
        box(7.4, 32, 43, 8, 33, 44.5, "chrome"),
        box(8.6, 32, 43, 9.2, 33, 44.5, "chrome")]})


def build() -> AreaCubes:
    result = AreaCubes({"body": _build_exterior()["body"]})
    result.merge(build_door_entry(kit.REGISTRY))
    result.merge(build_shower_door(kit.REGISTRY))
    return result
