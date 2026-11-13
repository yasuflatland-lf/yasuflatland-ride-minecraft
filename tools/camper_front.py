"""Build the camper front area."""

import math
from tool_loader import load_tool

kit = load_tool("camper_kit")
cube_tilt = load_tool("cube_tilt")
AreaCubes = kit.AreaCubes
BOTTOM = kit.BOTTOM
FRONT = kit.FRONT
HW = kit.HW
MIRROR_CHROME_REGION = kit.MIRROR_CHROME_REGION
MIRROR_THIN_UV = kit.MIRROR_THIN_UV
ROOF = kit.ROOF
SIDE0 = kit.SIDE0
TOP_FRONT = kit.TOP_FRONT
WS_Z = kit.WS_Z
box = kit.box
disc = kit.disc
rib_sides = kit.rib_sides
shift_in_slices = kit.shift_in_slices

AREA = "front"


def build() -> AreaCubes:
    body = []
    # --- Front ------------------------------------------------------------------
    SILL_LOW = 33  # The side walls stop here; the sloping sill closes the body above it.
    FRONT_START = len(body)
    UPPER = (19, 33)  # Upper grille across the face, in panel heights.
    LOWER_Y = (8, 19)  # Lower grille between the lamps, narrower at the bottom.
    # Leave room for the outer trim without widening the square body.
    EDGE_INSET = 0.4
    GRILLE_HALF = HW - EDGE_INSET
    FRAME = 0.45
    SLAT_THICK = 0.45
    SLAT_PITCH = 0.9
    SLAT_MARGIN = 0.05
    SEAM_STEP = 0.25
    GDIV = GRILLE_HALF * 7.5 / 19.5
    LOWER_HALF_BOTTOM, LOWER_HALF_TOP = 8, 12
    SILL, SLICE = 36, 0.5
    # Two flat panels from the bumper to the sill meet in a nose on the windshield's centre line, seen
    # from above; each leans at one slope so the side edge runs straight from the bumper to the sill. They
    # fold as much as the windshield so the sill's two edges stay parallel (ADR 0226).
    FRONT_YAW = 8
    EDGE_BACK = 1.0  # the deep fold moves the corners back so the nose stays behind the bumper's front
    FRONT_LEAN_SLOPE = 0.15
    BUMPER_SLOPE = 0.25  # the bumper keeps its place from before the panels (ADR 0226)
    FRONT_LEAN = math.degrees(math.atan(FRONT_LEAN_SLOPE))
    LEAN_SIN, LEAN_COS = math.sin(math.radians(FRONT_LEAN)), math.cos(math.radians(FRONT_LEAN))
    YAW_TAN, YAW_COS = math.tan(math.radians(FRONT_YAW)), math.cos(math.radians(FRONT_YAW))
    PANEL_TOP_Y = 34  # the sill is short and nearly level, dropping about 2 px from the windshield base
    PANEL_TOP = BOTTOM + (PANEL_TOP_Y - BOTTOM) / LEAN_COS
    NOSE_Z = FRONT + 0.5 + EDGE_BACK - HW * YAW_TAN


    def bumper_dz(y):
        return 0.5 - BUMPER_SLOPE * (y - BOTTOM)


    def edge_dz(y):
        return 0.5 + EDGE_BACK - FRONT_LEAN_SLOPE * (y - BOTTOM)


    def crease(h):
        """The nose line at panel height h: panel heights run along the lean, so rows keep their pitch."""
        return BOTTOM + (h - BOTTOM) * LEAN_COS, NOSE_Z - (h - BOTTOM) * LEAN_SIN


    def on_panel(sx, cube):
        """Place a cube built flat (x from the nose, y a panel height, z from FRONT) on panel sx.
        Each cube turns about the nose at its own height: a rectangle cannot follow both a horizontal
        row and the slanted nose, so every row keeps level and starts exactly on the nose."""
        origin, size = cube["origin"], cube["size"]
        old_pivot = cube.get("pivot", [0, origin[1] + size[1] / 2, FRONT])
        panel_turn = cube_tilt.panel_matrix(FRONT_LEAN, -sx * FRONT_YAW)
        # The build frame turns z in the math sense, so the game's z angle is written negated.
        rotation = cube_tilt.rotation_of(panel_turn, cube.get("rotation", [0, 0, 0])[2])
        y, z = crease(old_pivot[1])
        offset = cube_tilt.apply_matrix(panel_turn, [old_pivot[0], 0, old_pivot[2] - FRONT])
        pivot = [offset[0], y + offset[1], z + offset[2]]
        placed = dict(cube)
        placed["origin"] = [round(pivot[i] + origin[i] - old_pivot[i], 3) for i in range(3)]
        placed["pivot"] = [round(v, 3) for v in pivot]
        placed["rotation"] = rotation
        return placed


    def panel_bar(sx, a, b, h0, h1, w0, w1, color):
        x0, x1 = sorted((sx * a, sx * b))
        return on_panel(sx, box(x0, h0, FRONT + w0, x1, h1, FRONT + w1, color))


    panels = []
    for sx in (-1, 1):
        # A tall cube's end drifts about 0.06 px past the nose; the overlap and the post keep it closed.
        panels.append(panel_bar(sx, -0.1, GRILLE_HALF, UPPER[1], PANEL_TOP, 0, 0.3, "white"))
        panels.append(panel_bar(sx, -0.1, GRILLE_HALF, UPPER[0], UPPER[1], 0.7, 1, "grille"))
        h = BOTTOM
        while h < PANEL_TOP - 1e-6:
            top = min(h + 2, PANEL_TOP)
            panels.append(panel_bar(sx, GRILLE_HALF, HW / YAW_COS, h, top, -0.12, 0.7, "chrome"))
            h = top
        panels.append(panel_bar(sx, 0, GRILLE_HALF, UPPER[1] - FRAME, UPPER[1], -0.1, 0.7, "chrome"))
        panels.append(panel_bar(sx, 0, GRILLE_HALF, UPPER[0], UPPER[0] + FRAME, -0.1, 0.7, "chrome"))
        for a, b in ((0, GDIV), (GDIV, GRILLE_HALF)):
            y = UPPER[0] + FRAME + SLAT_MARGIN
            while y + SLAT_THICK < UPPER[1] - FRAME:
                panels.append(panel_bar(sx, a + (FRAME / 2 if a else 0), b - FRAME / 2,
                                        y, y + SLAT_THICK, 0.2, 0.7, "slat"))
                y += SLAT_PITCH
        for x in (GDIV, GRILLE_HALF - FRAME / 2):
            panels.append(panel_bar(sx, x - FRAME / 2, x + FRAME / 2,
                                    UPPER[0] + FRAME, UPPER[1] - FRAME, -0.1, 0.7, "chrome"))


    def lower_half(y):
        return LOWER_HALF_BOTTOM + (LOWER_HALF_TOP - LOWER_HALF_BOTTOM) * (y - LOWER_Y[0]) / (LOWER_Y[1] - LOWER_Y[0])


    # Black lamp pods flank the grille that narrows toward the bumper; their inner
    # edges follow its slanted sides, as on the reference.
    y = LOWER_Y[0]
    while y < LOWER_Y[1] - 1e-6:
        g = lower_half(y + SEAM_STEP / 2)
        for sx in (-1, 1):
            panels.append(panel_bar(sx, 0, g, y, y + SEAM_STEP, 0.2, 0.4, "black"))
            panels.append(panel_bar(sx, g, g + FRAME, y, y + SEAM_STEP, -0.1, 0.2, "chrome"))
            panels.append(panel_bar(sx, g + FRAME, GRILLE_HALF, y, y + SEAM_STEP, -0.1, 0.2, "black"))
        y += SEAM_STEP
    y = LOWER_Y[1] - SLAT_MARGIN - SLAT_THICK
    while y >= LOWER_Y[0] + FRAME:
        g = lower_half(y) - FRAME
        for sx in (-1, 1):
            panels.append(panel_bar(sx, 0, g, y, y + SLAT_THICK, -0.1, 0.2, "slat"))
        y -= SLAT_PITCH
    for sx in (1, -1):
        # Headlight at the outer corner of the pod, the turn signal beside it inboard.
        for cx, cy, w, r, depth, color in ((17.8, 13.0, -0.6, 2.6, 0.5, "chrome"), (17.8, 13.0, -0.8, 2.1, 0.3, "lens"),
                                           (13.9, 12.6, -0.6, 1.4, 0.4, "chrome"), (13.9, 12.6, -0.8, 1.1, 0.3, "amber")):
            panels += [on_panel(sx, c) for c in disc("z", sx * cx, cy, FRONT + w, r, depth, color)]
    # The windshield's chrome post continues over the sill and down the nose to the grille.
    panels.append(on_panel(1, box(-0.45, UPPER[1], FRONT - 0.45, 0.45, PANEL_TOP, FRONT, "chrome"))
                  | {"rotation": [FRONT_LEAN, 0, 0]})
    # Stainless bumper, thick, wrapping a little around the corners
    body.append(box(-HW + 0.5, 3, FRONT - 3, HW - 0.5, 8, FRONT + 1, "steel"))
    body.append(box(-HW + 0.5, 7.6, FRONT - 3.1, HW - 0.5, 8, FRONT - 2.9, "chrome"))
    for sx in (1, -1):
        x0, x1 = sorted((sx * (HW - 0.5), sx * (HW + 0.5)))
        body.append(box(x0, 3, FRONT - 1.5, x1, 8, FRONT + 3, "steel"))
    body.append(box(-4.5, 4, FRONT - 3.2, 4.5, 6.4, FRONT - 3, "white"))  # plate

    # Split upright windshield, its panes meeting at the centre post ahead of their outer edges,
    # as on the photos (ADR 0226).
    WS_YAW = FRONT_YAW
    WS_TAN, WS_COS = math.tan(math.radians(WS_YAW)), math.cos(math.radians(WS_YAW))
    WS_APEX = WS_Z - HW * WS_TAN


    def ws_z(x):
        return WS_APEX + abs(x) * WS_TAN


    def ws_piece(sx, a, b, y0, y1, w0, w1, color):
        """A cube on pane sx: a and b are distances along the pane from the centre line, over the true x."""
        x0, x1 = sorted((sx * a / WS_COS, sx * b / WS_COS))
        return box(x0, y0, WS_APEX + w0, x1, y1, WS_APEX + w1, color, [0, -sx * WS_YAW, 0], [0, (y0 + y1) / 2, WS_APEX])


    windshield = []
    for sx in (-1, 1):
        windshield.append(ws_piece(sx, 0.7, HW - EDGE_INSET - 0.6, 36, 49.5, 0.2, 0.4, "glass"))
        windshield.append(ws_piece(sx, HW - EDGE_INSET - 0.6, HW - EDGE_INSET, 36, 49.5, -0.2, 0.6, "black"))
        windshield.append(ws_piece(sx, 0, HW - EDGE_INSET, 35.4, 36, -0.2, 0.6, "black"))
        windshield.append(ws_piece(sx, 0, HW - EDGE_INSET, 49.5, 50.1, -0.2, 0.6, "black"))
        windshield.append(ws_piece(sx, HW - EDGE_INSET, HW, 35.4, 50.1, -0.2, 0.6, "aluminium"))
    windshield.append(box(-0.7, 36, WS_APEX - 0.2, 0.7, 49.5, WS_APEX + 0.6, "chrome"))
    for x in (-14, 5):
        side = -1 if x < 0 else 1
        windshield.append(box(x, 36.6, ws_z(x) - 0.6, x + 8, 37.2, ws_z(x), "black",
                              cube_tilt.rotation_of(cube_tilt.panel_matrix(0, -side * WS_YAW), 25), [x, 37, ws_z(x)]))

    # The bumper keeps its place under the leaning face: it moves back with height in slices.
    front, body = body[FRONT_START:], body[:FRONT_START] + panels
    for c in front:
        y0, sy = c["origin"][1], c["size"][1]
        if y0 + sy / 2 >= SILL or c.get("rotation", [0])[0]:
            body.append(c)
            continue
        cuts = [y0]
        if sy > SLICE * 1.5:
            while cuts[-1] + SLICE < y0 + sy - 1e-6:
                cuts.append(cuts[-1] + SLICE)
        cuts.append(y0 + sy)
        body += shift_in_slices(c, cuts, bumper_dz)
    body += windshield
    # Each row ends behind the tapered face, including its most recessed lower edge.
    for sx in (1, -1):
        x0, x1 = sorted((sx * (HW - 1), sx * HW))
        t0, t1 = sorted((sx * (HW - EDGE_INSET), sx * (HW + 0.2)))
        y = BOTTOM
        while y < SILL_LOW - 1e-6:
            EDGE_Z = FRONT + max(edge_dz(y), edge_dz(y + SLICE)) + 0.7
            color = "tan" if y < 15 else "white"
            body += rib_sides([box(x0, y, EDGE_Z, x1, y + SLICE, SIDE0, color)])
            body.append(box(t0, y, EDGE_Z - 0.2, t1, y + SLICE, EDGE_Z, "chrome"))
            y += SLICE
    # The A-pillars close the former side opening up to the windshield edge.
    PILLAR_STEP = 0.25
    for sx in (-1, 1):
        x0, x1 = sorted((sx * (HW - 1), sx * HW))
        y = 35.4
        while y < 49.5 - 1e-6:
            edge = WS_Z + 0.6
            body += rib_sides([box(x0, y, edge, x1, y + PILLAR_STEP, SIDE0 + 2.5, "white")])
            y += PILLAR_STEP
    # Narrow strips, each turned about x alone, run straight from the panels' top edge to the windshield.
    SILL_TOP = crease(PANEL_TOP)[1]
    SILL_FRONT_Y = PANEL_TOP_Y + 0.05
    SILL_STRIP = 0.5


    def sill_edge(x):
        """The sill's front z, the windshield's z, and the height gained per px of z at x."""
        front, back = SILL_TOP + abs(x) * YAW_TAN, ws_z(x)
        return front, back, (SILL - 0.1 - SILL_FRONT_Y) / (back - front)


    for i in range(round(HW / SILL_STRIP)):
        xm = (i + 0.5) * SILL_STRIP
        front, back, slope = sill_edge(xm)
        rise = math.degrees(math.atan(slope))
        length = (back - front) / math.cos(math.radians(rise))
        for sx in (-1, 1):
            x0, x1 = sorted((sx * i * SILL_STRIP, sx * (i + 1) * SILL_STRIP))
            body.append(box(x0, SILL_FRONT_Y - 0.25, front, x1, SILL_FRONT_Y, front + length, "white",
                            [rise, 0, 0], [0, SILL_FRONT_Y, front]))
    z = SILL_TOP
    # The walls run on to the side shell, past the windshield base, so its front end stays hidden.
    while z < SIDE0 - 1e-6:
        zc = z + 0.125
        if z < WS_APEX - 1e-6:
            front, _, slope = sill_edge(0)
            rib_y = SILL_FRONT_Y + slope * (zc - front)
            body.append(box(-0.45, rib_y - 0.2, z, 0.45, rib_y + 0.15, z + 0.25, "chrome"))  # center rib
        front, _, slope = sill_edge(HW)
        if zc >= front:
            for sx in (1, -1):
                top = min(SILL_FRONT_Y + slope * (zc - front), SILL)
                x0, x1 = sorted((sx * (HW - 1), sx * HW))
                body += rib_sides([box(x0, SILL_LOW, z, x1, top, z + 0.25, "white")])
                # chrome trim along the sloping edge on both sides
                t0, t1 = sorted((sx * (HW - 0.4), sx * (HW + 0.2)))
                body.append(box(t0, top - 0.4, z, t1, top + 0.05, z + 0.25, "chrome"))
        z += 0.25

    # The cab-over, after the owner's reference photos and marked render: the upper face is one flat
    # panel from the roof lip down to a V, lowest and furthest forward on the centre line, with its
    # ends at the points of the side walls' chrome chevrons. Two lower panels rise from the windshield
    # header to that V.
    CAP_Y0 = 49.5  # the windshield top
    CREASE = 56
    CAP_POINT_Y = 52
    CAP_LEAN = 0.75  # forward per px of drop below the roof, which puts the wall point at z = -59
    BOT_C = WS_Z - 0.5
    CAP_BACK = WS_Z + 6


    def lerp(a, b, t):
        return a + (b - a) * t


    def molding(sx, y0, y1, z):
        x0, x1 = sorted((sx * (HW - 0.3), sx * (HW + 0.2)))
        body.append(box(x0, y0, z - 0.2, x1, y1, z + 0.8, "chrome"))


    def cap_upper_z(y):
        return TOP_FRONT - CAP_LEAN * (ROOF - y)


    def cap_lower(y):
        """Below the V at height y: the V's half width, its z there, and the side wall's z."""
        wall_z = lerp(BOT_C, cap_upper_z(CREASE), (y - CAP_Y0) / (CREASE - CAP_Y0))
        if y >= CAP_POINT_Y:
            return HW * (y - CAP_POINT_Y) / (CREASE - CAP_POINT_Y), cap_upper_z(y), wall_z
        return 0, lerp(ws_z(0) - 0.5, cap_upper_z(CAP_POINT_Y), (y - CAP_Y0) / (CAP_POINT_Y - CAP_Y0)), wall_z


    def cap_skin(sx, x0, z0, x1, z1, y0, y1):
        """A thin bar on the skin from (x0, z0) to (x1, z1), turned about y so it stays level."""
        length = math.hypot(x1 - x0, z1 - z0)
        turn = math.degrees(math.atan2(-sx * (z1 - z0), x1 - x0))
        a0, a1 = sorted((sx * x0, sx * x0 + sx * length))
        return box(a0, y0, z0, a1, y1, z0 + 0.5, "white", [0, turn, 0], [sx * x0, y0, z0])


    for i in range(round((ROOF - CAP_Y0) / 0.25)):
        y0 = CAP_Y0 + 0.25 * i
        yc = y0 + 0.125
        if yc >= CREASE:
            wall_z = cap_upper_z(yc)
            body += rib_sides([box(-HW, y0, wall_z, HW, y0 + 0.25, CAP_BACK, "white")])
        else:
            nose_x, nose_z, wall_z = cap_lower(yc)
            fill = max(nose_z, wall_z) + 0.25
            body += rib_sides([box(-HW, y0, fill, HW, y0 + 0.25, CAP_BACK, "white")])
            if nose_x:
                body.append(box(-nose_x, y0, nose_z, nose_x, y0 + 0.25, fill, "white"))
            else:
                # The chrome strip on the fold between the two lower panels, as on the photos.
                body.append(box(-0.3, y0, nose_z - 0.15, 0.3, y0 + 0.25, nose_z + 0.5, "chrome"))
        for sx in (1, -1):
            if yc < CREASE:
                body.append(cap_skin(sx, nose_x, nose_z, HW, wall_z, y0, y0 + 0.25))
                x0, x1 = sorted((sx * (HW - 1), sx * HW))
                body += rib_sides([box(x0, y0, wall_z, x1, y0 + 0.25, fill, "white")])
            molding(sx, y0, y0 + 0.25, wall_z)
    for sx in (-1, 1):
        body.append(ws_piece(sx, 0, HW, 49.2, 49.7, -0.8, 1.7, "chrome"))
    mirror = []
    # Roof-edge lamps: a clearance dome near each corner and three identification lamps at the centre,
    # the middle one a flat lens.
    for x, half, dome in ((-21.5, 0.7, True), (-6, 0.7, True), (0, 1.2, False), (6, 0.7, True), (21.5, 0.7, True)):
        body.append(box(x - half - 0.2, ROOF - 0.1, TOP_FRONT - 0.1, x + half + 0.2, ROOF + 0.1, TOP_FRONT + 1.1, "chrome"))
        body.append(box(x - half, ROOF - 0.1, TOP_FRONT, x + half, ROOF + 0.7, TOP_FRONT + 1.0, "marker_amber"))
        if dome:
            body.append(box(x - 0.4, ROOF + 0.7, TOP_FRONT + 0.2, x + 0.4, ROOF + 1.0, TOP_FRONT + 0.8, "marker_amber"))
    for sx in (1, -1):
        # Rectangular side marker high on the wall, just behind the upper leg of the molding
        x0, x1 = sorted((sx * HW, sx * (HW + 0.25)))
        body.append(box(x0, 60.4, -51.8, x1, 61.8, -49.2, "amber"))
        # West-coast mirrors, as on the owner's photo: a chrome rod standing off the front pillar on
        # two brackets, carrying a tall rectangular housing strapped twice across its back. All of it
        # sits in the mirror bone, so one pass can draw it with the PBR texture set (ADR 0234).
        def xs(a, b):
            return min(sx * a, sx * b), max(sx * a, sx * b)
        mz = WS_Z + 3
        MY0, MY1, MX0, MX1 = 37, 47.5, HW + 0.8, HW + 6.2
        for by in (35.5, 49.5):  # brackets from the pillar out to the rod
            x0, x1 = xs(HW, HW + 3)
            mirror.append(box(x0, by - 0.3, mz - 0.3, x1, by + 0.3, mz + 0.3, MIRROR_CHROME_REGION, uv_size=MIRROR_THIN_UV))
        x0, x1 = xs(HW + 2.6, HW + 3.4)
        mirror.append(box(x0, 35.2, mz - 0.4, x1, 49.8, mz + 0.4, MIRROR_CHROME_REGION, uv_size=MIRROR_THIN_UV))  # rod
        x0, x1 = xs(MX0, MX1)
        mirror.append(box(x0, MY0, mz + 0.4, x1, MY1, mz + 1.2, MIRROR_CHROME_REGION))
        x0, x1 = xs(MX0 - 0.1, MX1 + 0.1)
        for strap_y in (MY0 + 3.3, MY1 - 3.3):
            mirror.append(box(x0, strap_y - 0.15, mz + 0.3, x1, strap_y + 0.15, mz + 1.3, MIRROR_CHROME_REGION, uv_size=MIRROR_THIN_UV))


    return AreaCubes({'body': body, 'mirror': mirror})
