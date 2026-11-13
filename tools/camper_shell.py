"""Build the camper shell area."""

import math
from tool_loader import load_tool

kit = load_tool("camper_kit")
ARCHES = kit.ARCHES
ARCH_INSET = kit.ARCH_INSET
ARCH_SLOPE_Y = kit.ARCH_SLOPE_Y
ARCH_STEP = kit.ARCH_STEP
ARCH_TOP = kit.ARCH_TOP
ATLAS = kit.ATLAS
AreaCubes = kit.AreaCubes
BAND_Y = kit.BAND_Y
BOTTOM = kit.BOTTOM
CAB_WIN = kit.CAB_WIN
CEIL = kit.CEIL
DOOR = kit.DOOR
FLOOR = kit.FLOOR
FRONT = kit.FRONT
FRONT_AXLE = kit.FRONT_AXLE
HW = kit.HW
REAR = kit.REAR
REAR_INNER = kit.REAR_INNER
ROOF = kit.ROOF
SIDE0 = kit.SIDE0
STRIPE_Y = kit.STRIPE_Y
VENT_CORNER = kit.VENT_CORNER
VENT_COVER = kit.VENT_COVER
VENT_RIM = kit.VENT_RIM
VENT_SCREWS_REGION = kit.VENT_SCREWS_REGION
VENT_SLIT = kit.VENT_SLIT
VENT_SLITS = kit.VENT_SLITS
VENT_SLIT_GAP = kit.VENT_SLIT_GAP
VENT_SLIT_MARGIN = kit.VENT_SLIT_MARGIN
VENT_SLIT_PITCH = kit.VENT_SLIT_PITCH
WATER_FILL_Y = kit.WATER_FILL_Y
WATER_FILL_Z = kit.WATER_FILL_Z
WIN_Y = kit.WIN_Y
box = kit.box
disc = kit.disc
left_windows = kit.left_windows
panel = kit.panel
rib_sides = kit.rib_sides
right_windows = kit.right_windows

AREA = "shell"


def build() -> AreaCubes:
    def vent_cover(z0, z1, y0, y1):
        """An aluminium-rimmed lid with two columns of louvre slits over a plain lower third (ADR 0157)."""
        band = HW + 0.1  # the khaki band's outer face
        w, r = VENT_RIM, VENT_CORNER
        iz0, iz1, iy0, iy1 = z0 + w, z1 - w, y0 + w, y1 - w
        rim_top = band + 0.4
        top_rail = box(band, y1 - w, z0 + w, rim_top, y1, z1 - w, "aluminium")
        top_rail["uv"]["east"] = ATLAS.face(VENT_SCREWS_REGION)
        cubes = [
            # The rim ring, with each outer corner cut by r so the lid reads as a rounded rectangle.
            top_rail,
            box(band, y0, z0 + w, rim_top, y0 + w, z1 - w, "chrome"),
            box(band, y0 + w, z0, rim_top, y1 - w, z0 + w, "chrome"),
            box(band, y0 + w, z1 - w, rim_top, y1 - w, z1, "chrome"),
        ]
        for outer_z, inner_z in (((z0, z0 + r), (z0 + r, z0 + w)), ((z1 - r, z1), (z1 - w, z1 - r))):
            for outer_y, inner_y in (((y0, y0 + r), (y0 + r, y0 + w)), ((y1 - r, y1), (y1 - w, y1 - r))):
                cy0, cy1 = min(*outer_y, *inner_y), max(*outer_y, *inner_y)
                cubes.append(box(band, cy0, inner_z[0], rim_top, cy1, inner_z[1], "chrome"))
                cubes.append(box(band, inner_y[0], outer_z[0], rim_top, inner_y[1], outer_z[1], "chrome"))
        # Louvre slits in the upper two thirds, in a left and a right column; the lower third stays plain.
        mid = (iz0 + iz1) / 2
        columns = ((iz0 + VENT_SLIT_MARGIN, mid - VENT_SLIT_GAP / 2), (mid + VENT_SLIT_GAP / 2, iz1 - VENT_SLIT_MARGIN))
        top = iy1 - VENT_SLIT_MARGIN
        slits = [
            (sz0, sz1, top - i * VENT_SLIT_PITCH - VENT_SLIT, top - i * VENT_SLIT_PITCH)
            for sz0, sz1 in columns
            for i in range(VENT_SLITS)
        ]
        # The panel sits 0.2 px under the rim; each slit is a further 0.1 px recess onto black.
        cubes += panel("x", band, band + 0.2, iz0, iz1, iy0, iy1, slits, "trim_beige")
        cubes += [box(band, sy0, sz0, band + 0.1, sy1, sz1, "black") for sz0, sz1, sy0, sy1 in slits]
        cubes.append(box(band + 0.2, iy0 + 0.4, mid - 0.6, band + 0.45, iy0 + 1.0, mid + 0.6, "steel"))  # latch
        for sz in (z0 + w / 2, mid, z1 - w / 2):  # screw heads on the rim
            for sy in (y0 + w / 2, y1 - w / 2):
                cubes.append(box(rim_top, sy - 0.15, sz - 0.15, rim_top + 0.05, sy + 0.15, sz + 0.15, "steel"))
        return cubes


    body = []
    # --- Floor, roof and walls -------------------------------------------------
    body.append(box(-HW + 1, 13, FRONT + 1, HW - 1, FLOOR, REAR_INNER, "wood"))
    body.append(box(-HW, CEIL, FRONT + 8.5, HW, ROOF, REAR_INNER, "white"))  # the cab-over fills the front
    body.append(box(-HW + 1, CEIL - 0.2, FRONT + 1, HW - 1, CEIL, REAR_INNER, "panel"))

    STRIPE_FRONT = FRONT + 10
    # The W, measured on the side close-up: p runs from its rear edge (0) to its front edge (1).
    # It is mirrored about p = 0.5, every stroke W_STROKE wide along p (#459).
    W_WIDTH, W_BOTTOM, W_STROKE = 16.5, ARCH_TOP + 1.5, 0.17
    W_REAR = FRONT_AXLE + W_WIDTH / 2  # centered over the front wheel
    W_MID = STRIPE_Y[1] - 0.32 * (STRIPE_Y[1] - W_BOTTOM)  # top of the middle peak
    W_ARM_START, W_FOOT, W_PEAK = (0.0, W_STROKE), (0.24, round(0.24 + W_STROKE, 6)), (0.415, 0.585)


    def w_z(p):
        return W_REAR - W_WIDTH * p


    def w_mirror(span):
        return (round(1 - span[1], 6), round(1 - span[0], 6))  # rounded so mirrored spans compare equal


    W_ARM_END = w_mirror(W_ARM_START)
    # Each stroke: its p span at the bottom, its p span at the top, and its top y. Both strokes
    # meeting at a foot share its span.
    W_STROKES = [(W_FOOT, W_ARM_START, STRIPE_Y[0]), (W_FOOT, W_PEAK, W_MID)]
    W_STROKES += [(w_mirror(b), w_mirror(t), y) for b, t, y in W_STROKES]


    def w_stroke(x0, x1, bottom, top, y_top):
        """One W stroke as a single cube turned about x, so its slanted edges stay straight; stair-
        stepped rows looked jagged (#459). The cube's ends are square to the stroke, so each end
        has one corner on the W's outline and the other inside it: past the top into the stripe
        for an outer arm, and short of the outline at the feet and the peak, where w_fill covers
        the gap. Returns the cube and that corner's height above the outline."""
        h = y_top - W_BOTTOM
        zb, zt = w_z(sum(bottom) / 2), w_z(sum(top) / 2)
        length = math.hypot(zt - zb, h)
        thick = W_WIDTH * (bottom[1] - bottom[0]) * h / length
        drop = thick * abs(zt - zb) / length
        yb = W_BOTTOM + drop / 2
        yt = y_top + drop / 2 if y_top == STRIPE_Y[0] else y_top - drop / 2
        yc = (yb + yt) / 2
        zc = zb + (zt - zb) * (yc - W_BOTTOM) / h
        half = (yt - yb) * length / h / 2
        # In game a negative x rotation tips the cube's top toward +z, the rear (ADR 0051).
        lean = -math.degrees(math.atan2(zt - zb, h))
        cube = box(x0, yc - half, zc - thick / 2, x1, yc + half, zc + thick / 2, "stripe", [lean, 0, 0], [x0, yc, zc])
        return cube, drop


    def w_arm_inner(y):
        """The p of an outer arm's inner edge at height y, a straight line through the arm's top
        corner on the stripe's lower edge and its foot, extended up through the stripe."""
        return W_ARM_START[1] + (W_FOOT[1] - W_ARM_START[1]) * (STRIPE_Y[0] - y) / (STRIPE_Y[0] - W_BOTTOM)


    def w_fill(x0, x1, span, y0, y1):
        return box(x0, y0, w_z(span[1]), x1, y1, w_z(span[0]), "stripe")


    # Wheel arches: wide at the bottom with the top corners cut, as on the photos.
    arch_holes = []
    for a0, a1 in ARCHES:  # straight up to ARCH_SLOPE_Y, then sloping in by ARCH_INSET in fine steps
        arch_holes.append((a0, a1, 0, ARCH_SLOPE_Y))
        n = round((ARCH_TOP - ARCH_SLOPE_Y) / ARCH_STEP)
        for i in range(n):
            inset = ARCH_INSET * (i + 0.5) / n
            y = ARCH_SLOPE_Y + i * ARCH_STEP
            arch_holes.append((a0 + inset, a1 - inset, y, y + ARCH_STEP))
    for x0, x1, windows in ((HW - 1, HW, right_windows), (-HW, -HW + 1, left_windows)):
        right = x0 > 0
        sgn = 1 if right else -1
        out = x1 if right else x0
        # The front cut-out reaches up to where the cab-over chevron passes SIDE0.
        holes = windows + arch_holes + [(SIDE0, -50.5, 35.4, 52)] + ([DOOR] if right else [])
        body += rib_sides(panel("x", x0, x1, SIDE0, REAR_INNER, BOTTOM, CEIL, holes, "white"))
        inner = x0 - 0.2 if right else x1
        body += panel("x", inner, inner + 0.2, FRONT + 8, REAR_INNER, FLOOR, CEIL - 0.2, holes, "wall_in")
        # Tan lower skirt just proud of the wall.
        skirt_holes = arch_holes + ([(DOOR[0], DOOR[1], DOOR[2], 16)] if right else [])
        lo, hi = (out, out + 0.12) if right else (out - 0.12, out)
        body += panel("x", lo, hi, SIDE0, REAR_INNER, BOTTOM, 15, skirt_holes, "tan")
        # As on the side photo: a tan band at window height from the cab window back, and one
        # brown stripe below it. Both continue across the door, which carries its own copies.
        door_cut = [(DOOR[0], DOOR[1], 0, 99)] if right else []
        lo, hi = (out, out + 0.1) if right else (out - 0.1, out)
        band_holes = [w for w in windows if w[:2] != CAB_WIN[:2]] + door_cut
        body += panel("x", lo, hi, CAB_WIN[1] + 1, REAR_INNER, *BAND_Y, band_holes, "khaki")
        lo, hi = (out, out + 0.12) if right else (out - 0.12, out)
        # The stripe dips into a large W ahead of the door; the W's top stays open between
        # its outer arms. The owner chose to keep this logo, an exception recorded in ADR 0067.
        # Its ends follow the arms' inner edges up through the stripe, so the outline has no step
        # where the stripe meets an arm: the panel is open at the widest, and quarter-pixel rows
        # stay inside the edge line (ADR 0145).
        w_wide = w_arm_inner(STRIPE_Y[1])
        w_open = (w_z(1 - w_wide), w_z(w_wide))
        body += panel("x", lo, hi, STRIPE_FRONT, REAR_INNER, *STRIPE_Y, door_cut + [(*w_open, *STRIPE_Y)], "stripe")
        y = STRIPE_Y[0]
        while y < STRIPE_Y[1] - 1e-6:  # the front end is cut on a slant, its top reaching further
            f = (y + 0.125 - STRIPE_Y[0]) / (STRIPE_Y[1] - STRIPE_Y[0])
            body.append(box(lo, y, STRIPE_FRONT - 3 * f, hi, y + 0.25, STRIPE_FRONT, "stripe"))
            y += 0.25
        y = STRIPE_Y[0]
        while y < STRIPE_Y[1] - 1e-6:
            p_row = w_arm_inner(y + 0.25)
            if p_row < w_wide - 1e-6:  # the top row would be flush with the panel's end
                body.append(box(lo, y, w_z(p_row), hi, y + 0.25, w_z(w_wide), "stripe"))
                body.append(box(lo, y, w_z(1 - w_wide), hi, y + 0.25, w_z(1 - p_row), "stripe"))
            y += 0.25
        drops = {}
        for bottom, top, y_top in W_STROKES:
            cube, drop = w_stroke(lo, hi, bottom, top, y_top)
            body.append(cube)
            for end in (bottom, top if y_top == W_MID else None):
                if end:
                    drops[end] = max(drops.get(end, 0), drop)
        for span, drop in drops.items():
            if span == W_PEAK:
                body.append(w_fill(lo, hi, span, W_MID - drop, W_MID))
            else:
                body.append(w_fill(lo, hi, span, W_BOTTOM, W_BOTTOM + drop))
        for z0, z1, y0, y1 in windows:
            frame = "black" if (z0, z1) == CAB_WIN[:2] else "trim_beige"
            for fz0, fz1, fy0, fy1 in ((z0 - 0.6, z1 + 0.6, y0 - 0.6, y0), (z0 - 0.6, z1 + 0.6, y1, y1 + 0.6),
                                       (z0 - 0.6, z0, y0, y1), (z1, z1 + 0.6, y0, y1)):
                body.append(box(out, fy0, fz0, out + sgn * 0.15, fy1, fz1, frame))
            body.append(kit.window_glass(x0, (z0, z1, y0, y1)))
        # Vent wing at the front of the cab window
        body.append(box(out, CAB_WIN[2], -46.5, out + sgn * 0.2, CAB_WIN[3], -45.9, "black"))
        # Side marker lights near the front and rear corners
        body.append(box(out, 10, FRONT + 4, out + sgn * 0.2, 12, FRONT + 6, "amber"))
        mo0, mo1 = sorted((out, out + sgn * 0.2))
        body.append(box(mo0, 29.6, FRONT + 3.5, mo1, 30.9, FRONT + 6.5, "red"))  # oval marker
        body.append(box(mo0, 29.2, FRONT + 4, mo1, 31.3, FRONT + 6, "red"))
        body.append(box(out, 19, REAR - 4, out + sgn * 0.2, 21, REAR - 2, "red"))

    body.append(box(HW, WIN_Y[0], -22.8, HW + 0.2, WIN_Y[1], -22.2, "aluminium"))  # double window dividers
    body.append(box(-HW - 0.2, WIN_Y[0], -17.3, -HW, WIN_Y[1], -16.7, "aluminium"))


    def water_fill(z, y):
        """The fresh water fill behind the door, measured on the owner's close-up photo: the frame's
        width of 195 photo px is 3.6 px here, and its centre sits 0.9 px under the skirt's top."""
        half_w, half_h, corner = 1.8, 2.95, 0.3
        opening_z, opening_y = 1.2, 2.05
        out = HW + 0.12  # the tan skirt's outer face
        # The frame's corners are clipped once for a rounded plate, and its opening is left dark.
        parts = panel("x", out, out + 0.18, z - half_w, z + half_w, y - half_h + corner, y + half_h - corner,
                      [(z - opening_z, z + opening_z, y - opening_y, y + opening_y)], "panel")
        for edge in (y - half_h, y + half_h - corner):
            parts.append(box(out, edge, z - half_w + corner, out + 0.18, edge + corner, z + half_w - corner, "panel"))
        parts.append(box(out, y - opening_y, z - opening_z, out + 0.04, y + opening_y, z + opening_z, "grille"))
        # Screw heads: three along the top and the bottom, one on each side, as on the photo.
        spots = [(dz, sy * (half_h - 0.28)) for dz in (-1.35, 0, 1.35) for sy in (-1, 1)]
        spots += [(sz * 1.5, 0) for sz in (-1, 1)]
        for dz, dy in spots:
            parts.append(box(out + 0.18, y + dy - 0.11, z + dz - 0.11, out + 0.22, y + dy + 0.11, z + dz + 0.11, "slat"))
        # The filler's round ring; bars stay straight, unlike stair steps.
        radius, bars = 1.0, 24
        points = [(radius * math.cos(2 * math.pi * i / bars), radius * math.sin(2 * math.pi * i / bars)) for i in range(bars)]
        for (z0, y0), (z1, y1) in zip(points, points[1:] + points[:1]):
            mid_z, mid_y = z + (z0 + z1) / 2, y + (y0 + y1) / 2
            half = math.hypot(z1 - z0, y1 - y0) / 2 + 0.05
            parts.append(box(out + 0.04, mid_y - 0.11, mid_z - half, out + 0.28, mid_y + 0.11, mid_z + half, "panel",
                             [math.degrees(math.atan2(y1 - y0, z1 - z0)), 0, 0], [out, mid_y, mid_z]))
        # The placard above it, on the white wall.
        plate_y = y + 4.6
        parts.append(box(HW, plate_y - 0.8, z - 1.15, HW + 0.08, plate_y + 0.8, z + 1.15, "chrome"))
        parts.append(box(HW + 0.08, plate_y - 0.7, z - 1.05, HW + 0.12, plate_y + 0.7, z + 1.05, "slat"))
        # The small round lamp at the top with its bright lower spot.
        lamp_y = y + 9.35
        parts += disc("x", HW, lamp_y, z, 0.95, 0.08, "chrome")
        parts += disc("x", HW + 0.08, lamp_y, z, 0.78, 0.06, "slat")
        # A thin plate above the lamp, then the filler cap: a metal disc in the ring, as on the photo.
        parts.append(box(HW, lamp_y + 2.2, z - 1.0, HW + 0.08, lamp_y + 2.6, z + 1.0, "chrome"))
        parts += disc("x", out + 0.04, y, z, 0.62, 0.2, "slat")
        return parts


    body += water_fill(WATER_FILL_Z, WATER_FILL_Y)
    body += vent_cover(*VENT_COVER)


    def storage_hatch():
        """The louvred storage hatch low at the right rear corner, measured on the owner's close-up photo: an
        aluminium rail with rounded top corners around a panel with five columns of 22 louvers."""
        Z0, Z1, Y0, Y1 = 42.6, 55.4, 8.2, 24
        RAIL, CORNER = 0.45, 1.6

        def on_wall(a, b, y0, y1, z0, z1, color):
            return box(HW + a, y0, z0, HW + b, y1, z1, color)

        def rounded(depth0, depth1, inset, color):
            """A plate inset from the hatch's outline, with level rows cutting its top corners."""
            z0, z1, y0, y1, radius = Z0 + inset, Z1 - inset, Y0 + inset, Y1 - inset, max(CORNER - inset, 0.4)
            parts = [on_wall(depth0, depth1, y0, y1 - radius, z0, z1, color)]
            rows = 5
            for i in range(rows):
                dy = (i + 0.5) * radius / rows
                cut = radius - math.sqrt(radius ** 2 - dy ** 2)
                row_y = y1 - radius + i * radius / rows
                parts.append(on_wall(depth0, depth1, row_y, row_y + radius / rows, z0 + cut, z1 - cut, color))
            return parts

        parts = rounded(0, 0.3, 0, "aluminium") + rounded(0.3, 0.33, 0.12, "chrome")
        parts += rounded(0.33, 0.36, RAIL, "panel")
        # A dark edge under the rail, as on the photo where the hatch meets the skirt.
        parts.append(on_wall(0, 0.32, Y0 - 0.2, Y0, Z0, Z1, "black"))
        inner_z0, inner_z1 = Z0 + RAIL + 0.6, Z1 - RAIL - 0.6
        gap = 0.25
        column = (inner_z1 - inner_z0 - 4 * gap) / 5
        first_y, pitch, count = Y0 + RAIL + 0.7, 0.55, 22
        for i in range(count):
            y = first_y + i * pitch
            parts.append(on_wall(0.36, 0.38, y - 0.14, y, inner_z0, inner_z1, "grille"))
            parts.append(on_wall(0.36, 0.5, y, y + 0.3, inner_z0, inner_z1, "panel"))
        top = first_y + count * pitch
        for i in range(1, 5):
            z = inner_z0 + i * (column + gap) - gap
            parts.append(on_wall(0.36, 0.52, first_y - 0.14, top, z, z + gap, "panel"))
        # The screws the photo shows: on the column lines above, across the middle, and below the louvers.
        lines = [inner_z0 + i * (column + gap) - gap / 2 for i in (1, 2, 3, 4)]
        spots = [(lines[0], top + 0.5), (lines[3], top + 0.5), (lines[1], first_y + 5.5), (lines[2], first_y + 5.5),
                 (lines[0], first_y + 0.9), (lines[0], first_y - 0.45), (lines[3], first_y + 0.9), (lines[3], first_y - 0.45)]
        for z, y in spots:
            parts.append(on_wall(0.52, 0.55, y - 0.09, y + 0.09, z - 0.09, z + 0.09, "slat"))
        for i in range(6):
            z = Z0 + 1.2 + i * (Z1 - Z0 - 2.4) / 5
            parts.append(on_wall(0.3, 0.34, Y1 - 0.26, Y1 - 0.08, z - 0.09, z + 0.09, "grille"))
        # The small dark label at the top centre in a bright surround.
        mid = (Z0 + Z1) / 2
        parts.append(on_wall(0.36, 0.4, top + 0.25, top + 1.15, mid - 0.7, mid + 0.7, "chrome"))
        parts.append(on_wall(0.4, 0.43, top + 0.35, top + 1.05, mid - 0.55, mid + 0.55, "grille"))
        # Three latch knobs on the rear rail: a dark base with a bright cap.
        for y in (Y0 + 2.7, Y0 + 7.4, Y0 + 11.3):
            parts.append(on_wall(0.3, 0.6, y - 0.4, y + 0.4, Z1 - 0.7, Z1 + 0.1, "slat"))
            parts.append(on_wall(0.6, 0.68, y - 0.25, y + 0.25, Z1 - 0.55, Z1 - 0.05, "chrome"))
        # The bottom of the riveted wall panel above the hatch: its seam and its rivet row.
        parts.append(on_wall(0, 0.03, Y1 + 0.7, Y1 + 3.5, Z0 + 2.2, Z0 + 2.3, "slat"))
        for i in range(5):
            z = Z0 + 2.4 + i * 1.9
            parts.append(on_wall(0, 0.03, Y1 + 0.75, Y1 + 0.93, z - 0.09, z + 0.09, "slat"))
        return parts


    body += storage_hatch()
    body.append(box(-HW - 0.3, 16, 13, -HW, 22, 19, "panel"))  # left side service hatch
    body.append(box(-HW - 0.4, 19, 14, -HW - 0.3, 20, 15.5, "chrome"))


    return AreaCubes({'body': body})
