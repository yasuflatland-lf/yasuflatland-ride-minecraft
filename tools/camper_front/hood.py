"""Chamfered body, lean and sloping sill."""

from .context import FrontContext
from .shape import ridge_dz


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
    for c in panel("z", FRONT, FRONT + 1, -FW, FW, LOWER_Y[1], SILL_LOW, [(-ctx.shape.grille_half_span, ctx.shape.grille_half_span, *UPPER)], "white"):
        x, y, z = c["origin"]
        w, h, d = c["size"]
        spans = ((x, 0), (0, x + w)) if x < 0 < x + w else ((x, x + w),)
        for a, b in spans:
            front.append(ctx.folded_box(a, y, z, b, y + h, z + d, "white", HW))
    # The windshield's chrome center post continues as a raised rib over the sill and down the
    # face between the two upper panels to the grille, as on the photo.
    front.append(box(-0.45, UPPER[1], FRONT - ctx.shape.grille_ridge_px - 0.45, 0.45, SILL_LOW, FRONT - ctx.shape.grille_ridge_px, "chrome"))
    front.extend(ctx.front)

    # The whole front face below the sill leans by FrontShape.lean_deg (ADR 0199): every
    # front cube below the sill shifts with its height,
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
    # The side edge follows the same half-pixel lean as the chamfered face.
    for sx in (1, -1):
        x0, x1 = sorted((sx * (HW - 1), sx * HW))
        t0, t1 = sorted((sx * (HW - 0.4), sx * (HW + 0.2)))
        y = BOTTOM
        while y < SILL_LOW - 1e-6:
            y1 = min(y + SLICE, SILL_LOW)
            edge = FRONT + ctx.shape.lean_dz((y + y1) / 2) + 1.5
            if edge < SIDE0:
                c = box(x0, y, edge, x1, y1, SIDE0, "tan" if y < 15 else "white")
                body.extend([c] if y < 15 else rib_sides([c]))
            body.append(box(t0, y, edge - 0.2, t1, y1, edge + 0.5, "chrome"))
            y = y1
    # Each strip starts on the V and ends at the straight windshield foot.
    SILL_FRONT = FRONT + ctx.shape.lean_dz(SILL_LOW)
    x = -HW
    while x < HW - 1e-6:
        x1 = min(x + 0.5, HW)
        xc = (x + x1) / 2
        nose = SILL_FRONT + ridge_dz(xc, ctx.shape.grille_ridge_px, HW)
        z = nose + max(0, abs(xc) - FW)
        while z < WS_Z - 1e-6:
            z1 = min(z + 0.25, WS_Z)
            top = SILL - 1.5 * (WS_Z - (z + z1) / 2) / (WS_Z - nose)
            body.append(box(x, SILL_LOW, z, x1, top, z1, "white"))
            if abs(xc) < 0.5:
                body.append(box(x, top - 0.2, z, x1, top + 0.35, z1, "chrome"))
            if abs(xc) > HW - 0.5 or (abs(xc) > FW and z == nose + abs(xc) - FW):
                body.append(box(x, top - 0.4, z, x1, top + 0.05, z1, "chrome"))
            z = z1
        x = x1
    nose = SILL_FRONT - ctx.shape.grille_ridge_px
    body.append(box(-0.45, SILL_LOW, nose - 0.45, 0.45, SILL - 1.5 + 0.35, nose, "chrome"))
