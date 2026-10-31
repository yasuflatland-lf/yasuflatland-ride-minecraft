"""Grilles, lamp pods and bumper."""

from .context import FrontContext
from .shape import GRILLE_STEP, ridge_dz


def build(ctx: FrontContext) -> None:
    body = ctx.front
    FW = ctx.FW
    FRONT = ctx.FRONT
    UPPER = ctx.UPPER
    LOWER_Y = ctx.LOWER_Y
    SLAT_Y = ctx.SLAT_Y
    HW = ctx.HW
    box = ctx.box
    disc = ctx.disc
    corner = ctx.corner

    for sx in (1, -1):
        cubes = [corner(sx, FRONT, UPPER[0], UPPER[1], "grille")]
        for y in SLAT_Y:
            cubes.append(corner(sx, FRONT, y, y + 0.8, "slat", inset=0.3))
        ctx.grille_corners[sx] = cubes
    # Upper grille in three sections, as on the lower-front photo; the middle section's slats
    # dip in a shallow V whose point reaches down into the lower grille.
    GDIV, V_DIP, STEP = 7.5, 1.2, GRILLE_STEP
    for x0, x1 in ((-ctx.shape.grille_half_span, 0), (0, ctx.shape.grille_half_span)):
        body.append(ctx.folded_box(x0, UPPER[0], FRONT + 0.7, x1, UPPER[1], FRONT + 1, "grille"))

    def dip(x):
        return V_DIP * (1 - abs(x) / GDIV)

    for x0, x1 in ((-ctx.shape.grille_half_span, -GDIV), (-GDIV, GDIV), (GDIV, ctx.shape.grille_half_span)):
        middle = x0 == -GDIV
        for y in SLAT_Y:
            if not middle:
                body.append(ctx.folded_box(x0 + 0.5, y, FRONT + 0.3, x1 - 0.5, y + 0.8, FRONT + 0.7, "slat", preserve_width=True))
                continue
            xa = x0 + 0.5
            while xa < x1 - 0.5 - 1e-6:
                d = dip(xa + STEP / 2)
                dz = ridge_dz(xa + STEP / 2, ctx.shape.grille_ridge_px, ctx.shape.grille_half_span)
                body.append(box(xa, y - d, FRONT + 0.3 + dz, xa + STEP, y - d + 0.8, FRONT + 0.7 + dz, "slat"))
                xa += STEP
        for a, b in (((x0, 0), (0, x1)) if middle else ((x0, x1),)):
            body.append(ctx.folded_box(a, UPPER[1] - 0.5, FRONT + 0.1, b, UPPER[1], FRONT + 0.7, "chrome"))
        if middle:  # the bottom bar and the backing follow the V down
            xa = x0
            while xa < x1 - 1e-6:
                d = dip(xa + STEP / 2)
                dz = ridge_dz(xa + STEP / 2, ctx.shape.grille_ridge_px, ctx.shape.grille_half_span)
                body.append(box(xa, UPPER[0] - d, FRONT + 0.1 + dz, xa + STEP, UPPER[0] - d + 0.5, FRONT + 0.7 + dz, "chrome"))
                body.append(box(xa, UPPER[0] - d, FRONT + 0.7 + dz, xa + STEP, UPPER[0], FRONT + 1 + dz, "grille"))
                xa += STEP
        else:
            body.append(ctx.folded_box(x0, UPPER[0], FRONT + 0.1, x1, UPPER[0] + 0.5, FRONT + 0.7, "chrome"))
        for fx in (x0, x1 - 0.5):
            body.append(ctx.folded_box(fx, UPPER[0], FRONT + 0.1, fx + 0.5, UPPER[1], FRONT + 0.7, "chrome"))
    # Below it, black lamp pods at both sides and a lower grille between them that narrows
    # toward the bumper; the pods' inner edges follow the grille's slanted sides.

    def lower_half(y):
        return 8 + 4 * (y - LOWER_Y[0]) / (LOWER_Y[1] - LOWER_Y[0])

    y = LOWER_Y[0]
    while y < LOWER_Y[1] - 1e-6:
        g = lower_half(y + STEP / 2)
        body.append(box(-g, y, FRONT - 0.2, g, y + STEP, FRONT + 1, "black"))  # grille backing
        for sx in (1, -1):
            x0, x1 = sorted((sx * (g + 0.5), sx * FW))
            body.append(box(x0, y, FRONT - 0.3, x1, y + STEP, FRONT + 1, "black"))  # lamp pod
            e0, e1 = sorted((sx * g, sx * (g + 0.5)))
            body.append(box(e0, y, FRONT - 0.6, e1, y + STEP, FRONT + 1, "chrome"))  # grille edge
        y += STEP
    for i in range(6):
        y = LOWER_Y[1] - 1.6 - i * 1.5
        g = lower_half(y + 0.4)
        body.append(box(-g, y, FRONT - 0.5, g, y + 0.8, FRONT - 0.2, "slat"))
    for sx in (1, -1):
        # Headlight at the outer corner of the pod, the turn signal beside it inboard.
        body += disc("z", sx * 17.8, 13.0, FRONT - 0.6, 2.6, 0.5, "chrome")
        body += disc("z", sx * 17.8, 13.0, FRONT - 0.8, 2.1, 0.3, "lens")
        body += disc("z", sx * 13.9, 12.6, FRONT - 0.6, 1.4, 0.4, "chrome")
        body += disc("z", sx * 13.9, 12.6, FRONT - 0.8, 1.1, 0.3, "amber")
    # Stainless bumper, thick, wrapping a little around the corners
    body.append(box(-HW + 0.5, 3, FRONT - 3, HW - 0.5, 8, FRONT + 1, "steel"))
    body.append(box(-HW + 0.5, 7.6, FRONT - 3.1, HW - 0.5, 8, FRONT - 2.9, "chrome"))
    for sx in (1, -1):
        x0, x1 = sorted((sx * (HW - 0.5), sx * (HW + 0.5)))
        body.append(box(x0, 3, FRONT - 1.5, x1, 8, FRONT + 3, "steel"))
    body.append(box(-4.5, 4, FRONT - 3.2, 4.5, 6.4, FRONT - 3, "white"))  # plate
