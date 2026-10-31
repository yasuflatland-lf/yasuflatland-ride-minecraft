"""Cab-over faces, moldings, lamps and mirrors."""

from .context import FrontContext


def build(ctx: FrontContext) -> None:
    body = ctx.body
    HW = ctx.HW
    FW = ctx.FW
    WS_Z = ctx.WS_Z
    ROOF = ctx.ROOF
    TOP_FRONT = ctx.TOP_FRONT
    BOLT_REGION = ctx.BOLT_REGION
    ATLAS = ctx.ATLAS
    box = ctx.box
    corner = ctx.corner
    rib_sides = ctx.rib_sides

    # The cab-over, after the owner's reference photos: each side wall ends in a forward-pointing
    # chevron edged in chrome. Its nose (the crease) sits 45 % of the way up the cap, level with
    # the bumper front. The lower face runs from the crease back to the windshield header, with a
    # slanted end facet over each corner glass; the upper face is one flat panel up to the roof
    # edge, where the five lamps stand.
    CAP_Y0 = 49.5  # the windshield top
    CREASE = 56
    NOSE = WS_Z - 5.5
    BOT_C, BOT_S = WS_Z - 0.5, WS_Z + 3  # lower face foot over the windshield and at the side pillar
    CAP_BACK = WS_Z + 6
    body.append(box(-FW, CAP_Y0, BOT_C, FW, ROOF, CAP_BACK, "white"))
    body += rib_sides([box(-HW, CAP_Y0, BOT_S, HW, ROOF, CAP_BACK, "white")])

    def lerp(a, b, t):
        return a + (b - a) * t

    def molding(sx, y0, y1, z):
        x0, x1 = sorted((sx * (HW - 0.3), sx * (HW + 0.2)))
        body.append(box(x0, y0, z - 0.2, x1, y1, z + 0.8, "chrome"))

    def chevron_molding(y0, y1, z):
        for sx in (1, -1):
            molding(sx, y0, y1, z)

    LAYERS = round((CREASE - CAP_Y0) / 0.25)  # quarter-pixel steps keep both faces smooth
    FACET_COL = 0.5
    for i in range(LAYERS):
        y0 = CAP_Y0 + 0.25 * i
        t = (i + 0.5) / LAYERS
        zc, ze = lerp(BOT_C, NOSE, t), lerp(BOT_S, NOSE, t)
        body.append(box(-FW, y0, zc, FW, y0 + 0.25, CAP_BACK, "white"))
        x = FW
        while x < HW - 1e-6:  # the end facet's front edge runs from (FW, zc) to (HW, ze)
            z = lerp(zc, ze, (x + FACET_COL / 2 - FW) / (HW - FW))
            for sx in (1, -1):
                x0, x1 = sorted((sx * x, sx * (x + FACET_COL)))
                body += rib_sides([box(x0, y0, z, x1, y0 + 0.25, BOT_S + 0.5, "white")])
            x += FACET_COL
        chevron_molding(y0, y0 + 0.25, ze)
    UPPER_LAYERS = round((ROOF - CREASE) / 0.25)
    for i in range(UPPER_LAYERS):
        y0 = CREASE + 0.25 * i
        zf = lerp(NOSE, TOP_FRONT, (i + 0.5) / UPPER_LAYERS)
        body += rib_sides([box(-HW, y0, zf, HW, y0 + 0.25, CAP_BACK, "white")])
        chevron_molding(y0, y0 + 0.25, zf)
        if 60 <= y0 < 62.5:  # the dark window set into the upper face, right of centre on the photo
            body.append(box(-3.5, y0, zf - 0.1, 9.5, y0 + 0.25, zf + 0.3, "grille"))
    for sx in (1, -1):  # the molding carries on down the pillar to the corner glass foot
        molding(sx, 35.4, CAP_Y0, BOT_S)
        body.append(corner(sx, WS_Z, 49.2, 49.7, "chrome"))  # header strip over the corner glass
    body.append(box(-FW, 49.2, BOT_C - 0.3, FW, 49.7, BOT_C + 2.2, "chrome"))  # windshield header strip
    roof_lip = box(-HW - 0.2, ROOF - 0.6, TOP_FRONT - 0.3, HW + 0.2, ROOF + 0.1, TOP_FRONT + 0.7, "aluminium")
    roof_lip["uv"]["north"] = ATLAS.face(BOLT_REGION, uv_size=(roof_lip["size"][0], 1))
    body.append(roof_lip)
    # Roof-lip lamps: a clearance dome near each corner and three identification lamps at the centre,
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
        # West-coast mirrors, as on the close-up: a chrome rod standing off the front pillar on
        # two brackets, carrying a tall mirror with rounded corners that faces the rear.
        def xs(a, b):
            return min(sx * a, sx * b), max(sx * a, sx * b)
        mz = WS_Z + 3
        for by in (35.5, 49.5):  # brackets from the pillar out to the rod
            x0, x1 = xs(HW, HW + 3)
            body.append(box(x0, by - 0.3, mz - 0.3, x1, by + 0.3, mz + 0.3, "chrome"))
        x0, x1 = xs(HW + 2.6, HW + 3.4)
        body.append(box(x0, 35.2, mz - 0.4, x1, 49.8, mz + 0.4, "chrome"))  # rod
        MY0, MY1, MX0, MX1 = 37, 47.5, HW + 0.8, HW + 6.2
        for inset, rise in ((1.8, 0), (0.9, 0.4), (0.35, 1.0), (0, 1.8)):  # rounded ends
            x0, x1 = xs(MX0 + inset, MX1 - inset)
            body.append(box(x0, MY0 + rise, mz + 0.4, x1, MY1 - rise, mz + 1.2, "chrome"))
        for ry in [MY0 + 1.6 + i * 1.3 for i in range(6)]:  # ribs across its back, facing forward
            x0, x1 = xs(MX0 + 0.5, MX1 - 0.5)
            body.append(box(x0, ry, mz + 0.15, x1, ry + 0.45, mz + 0.4, "slat"))
        x0, x1 = xs(MX0 + 0.4, MX1 - 0.4)
        body.append(box(x0, MY0 + 0.4, mz + 1.2, x1, MY1 - 0.4, mz + 1.3, "glass"))
