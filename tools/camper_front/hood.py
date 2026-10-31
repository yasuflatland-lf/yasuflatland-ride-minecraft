"""Chamfered body, lean and sloping sill."""

from .context import FrontContext


def build(ctx: FrontContext) -> None:
    body = ctx.body
    HW = ctx.HW
    FW = ctx.FW
    FRONT = ctx.FRONT
    WS_Z = ctx.WS_Z
    SILL = ctx.SILL
    SILL_LOW = ctx.SILL_LOW
    UPPER = ctx.UPPER
    LOWER_Y = ctx.LOWER_Y
    BOTTOM = ctx.BOTTOM
    SIDE0 = ctx.SIDE0
    SLICE = ctx.SLICE
    box = ctx.box
    panel = ctx.panel
    corner = ctx.corner
    rib_sides = ctx.rib_sides
    shift_in_slices = ctx.shift_in_slices

    front = []
    # Corner cubes were interleaved by side before the face; preserve that order before slicing.
    for sx in (1, -1):
        front.append(corner(sx, FRONT, BOTTOM, UPPER[0], "white"))
        front.append(corner(sx, FRONT, UPPER[1], SILL_LOW, "white"))
        front.extend(ctx.grille_corners[sx])
        front.append(corner(sx, FRONT, BOTTOM, 15, "tan", inset=0.12))
        front.extend(ctx.glass_corners[sx])
    front += panel("z", FRONT, FRONT + 1, -FW, FW, LOWER_Y[1], SILL_LOW, [(-19.5, 19.5, *UPPER)], "white")
    # The windshield's chrome center post continues as a raised rib over the sill and down the
    # face between the two upper panels to the grille, as on the photo.
    front.append(box(-0.45, UPPER[1], FRONT - 0.45, 0.45, SILL_LOW, FRONT, "chrome"))
    front.extend(ctx.front)

    # As on the cab close-up, the body under the windshield juts out at the sill and tapers
    # back toward the bottom: every front cube below the sill moves forward with its height,
    # tall ones cut into slices so the face steps back smoothly, and the side walls are
    # carried forward to meet it.
    for c in front:
        y0, sy = c["origin"][1], c["size"][1]
        rot = c.get("rotation")
        if y0 + sy / 2 >= SILL or (rot and rot[0]):
            body.append(c)
            continue
        cuts = [y0]
        if sy > SLICE * 1.5 and not (rot and rot[2]):
            while cuts[-1] + SLICE < y0 + sy - 1e-6:
                cuts.append(cuts[-1] + SLICE)
        cuts.append(y0 + sy)
        body += shift_in_slices(c, cuts, ctx.shape.lean_dz)
    # The side walls reach forward to the overhang with a straight upright edge in chrome trim.
    EDGE_Z = FRONT + ctx.shape.lean_dz(UPPER[0]) + 1.5
    for sx in (1, -1):
        x0, x1 = sorted((sx * (HW - 1), sx * HW))
        body.append(box(x0, BOTTOM, EDGE_Z, x1, 15, SIDE0, "tan"))
        body += rib_sides([box(x0, 15, EDGE_Z, x1, SILL_LOW, SIDE0, "white")])
        t0, t1 = sorted((sx * (HW - 0.4), sx * (HW + 0.2)))
        body.append(box(t0, BOTTOM, EDGE_Z - 0.2, t1, SILL_LOW, EDGE_Z + 0.5, "chrome"))
    # The sill: from the windshield foot it slopes down toward the front, as on the photo,
    # in quarter-pixel columns whose width follows the chamfered front corners.
    SILL_FRONT = FRONT + ctx.shape.lean_dz(UPPER[0])
    z = SILL_FRONT
    while z < WS_Z - 1e-6:
        zc = z + 0.125
        top = SILL - 1.5 * (WS_Z - zc) / (WS_Z - SILL_FRONT)
        half = min(HW, FW + (zc - SILL_FRONT))
        body.append(box(-half, SILL_LOW, z, half, top, z + 0.25, "white"))
        for sx in (1, -1):  # chrome trim along the sloping edge on both sides
            t0, t1 = sorted((sx * (half - 0.4), sx * (half + 0.2)))
            body.append(box(t0, top - 0.4, z, t1, top + 0.05, z + 0.25, "chrome"))
        body.append(box(-0.45, top - 0.2, z, 0.45, top + 0.35, z + 0.25, "chrome"))  # center rib
        z += 0.25
    body.append(box(-0.45, SILL_LOW, SILL_FRONT - 0.45, 0.45, SILL - 1.5 + 0.35, SILL_FRONT, "chrome"))  # rib over the nose
